"""
Trains and evaluates the Flight Ripple models, then writes one JSON artifact for ClaimWing.

    python -m ripple_ml.train --source nycflights13 --data-dir <dir> --out ../data/models/ripple-model.json
    python -m ripple_ml.train --source bts --data-dir <dir with BTS monthly CSVs> --out ../data/models/ripple-model.json

Model A: arrival delay of at least 15, 60 and 180 minutes, at two stages (pre-departure and
en route), plus the median arrival delay. Model B: departure delay of the next leg flown by the
same aircraft. Model B needs a source with both directions of each rotation (BTS); with a
departures-only source it is skipped and the artifact records why.

Splits are chronological with a 7-day embargo between them so the same daily flight cannot sit
on both sides of a boundary: train (oldest ~68%), calibration (~16%), test (newest ~16%).
Isotonic calibration is fitted on the calibration period only; every reported metric is on the
test period, which no model or calibration step has seen.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import time

import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.isotonic import IsotonicRegression

from . import features as F
from .export import apply_isotonic, export_booster, isotonic_export, raw_score
from .ingest import describe, load_source, load_tz_table
from .metrics import classification_report, regression_report

SCHEMA_VERSION = 1
EMBARGO = pd.Timedelta(days=7)
GBM_PARAMS = dict(
    n_estimators=600, learning_rate=0.05, num_leaves=15, min_child_samples=200,
    subsample=0.8, subsample_freq=1, colsample_bytree=0.8, reg_lambda=1.0, verbose=-1,
)


def chronological_split(df: pd.DataFrame, a: float = 0.68, b: float = 0.84):
    t = df["sched_dep_utc"]
    cut1, cut2 = t.quantile(a), t.quantile(b)
    train = df.loc[t < cut1]
    cal = df.loc[(t >= cut1 + EMBARGO) & (t < cut2)]
    test = df.loc[t >= cut2 + EMBARGO]
    info = {
        "train": [str(train.sched_dep_utc.min()), str(train.sched_dep_utc.max()), int(len(train))],
        "calibration": [str(cal.sched_dep_utc.min()), str(cal.sched_dep_utc.max()), int(len(cal))],
        "test": [str(test.sched_dep_utc.min()), str(test.sched_dep_utc.max()), int(len(test))],
        "embargo_days": EMBARGO.days,
    }
    return train, cal, test, info


def fit_classifier(X: pd.DataFrame, y: pd.Series, seed: int):
    n = len(X)
    stop = int(n * 0.9)  # last 10% of the (time-ordered) training rows for early stopping
    clf = lgb.LGBMClassifier(**GBM_PARAMS, random_state=seed)
    clf.fit(X.iloc[:stop], y.iloc[:stop], eval_X=X.iloc[stop:], eval_y=y.iloc[stop:], callbacks=[lgb.early_stopping(50, verbose=False)])
    return clf


def choose_calibration(raw_cal: np.ndarray, y_cal: np.ndarray, times: pd.Series):
    """
    Decides, without touching the test period, whether isotonic calibration helps. The calibration
    period is split in time: isotonic is fitted on the first half and compared with the raw scores
    on the second half by log loss. If it helps, it is refitted on the whole calibration period.
    """
    from .metrics import log_loss

    order = np.argsort(times.to_numpy())
    half = len(order) // 2
    first, second = order[:half], order[half:]
    iso_half = IsotonicRegression(out_of_bounds="clip", y_min=0.0, y_max=1.0).fit(raw_cal[first], y_cal[first])
    ll_iso = log_loss(y_cal[second], np.clip(iso_half.predict(raw_cal[second]), 1e-4, 1 - 1e-4))
    ll_raw = log_loss(y_cal[second], raw_cal[second])
    decision = {"held_out_log_loss_raw": round(ll_raw, 5), "held_out_log_loss_isotonic": round(ll_iso, 5)}
    if ll_iso < ll_raw:
        iso = IsotonicRegression(out_of_bounds="clip", y_min=0.0, y_max=1.0).fit(raw_cal, y_cal)
        return iso, {**decision, "used": "isotonic"}
    return None, {**decision, "used": "none (raw scores were better calibrated on held-out data)"}


def fit_regressor(X: pd.DataFrame, y: pd.Series, seed: int):
    n = len(X)
    stop = int(n * 0.9)
    reg = lgb.LGBMRegressor(**{**GBM_PARAMS, "objective": "l1"}, random_state=seed)
    reg.fit(X.iloc[:stop], y.iloc[:stop], eval_X=X.iloc[stop:], eval_y=y.iloc[stop:], callbacks=[lgb.early_stopping(50, verbose=False)])
    return reg


def route_rate_baseline(train: pd.DataFrame, target: str):
    prior = float(train[target].mean())
    g = train.groupby(["origin", "dest"])[target].agg(["sum", "size"])
    table = {k: (r["sum"] + F.SMOOTHING * prior) / (r["size"] + F.SMOOTHING) for k, r in g.iterrows()}
    return lambda df: np.array([table.get((o, d), prior) for o, d in zip(df.origin, df.dest)])


def dep_delay_baseline(train: pd.DataFrame, target: str):
    bucket = lambda s: np.clip(np.floor(s.fillna(0) / 15), -2, 24)  # noqa: E731
    rates = train.groupby(bucket(train.dep_delay))[target].mean()
    prior = float(train[target].mean())
    return lambda df: bucket(df.dep_delay).map(rates).fillna(prior).to_numpy()


def train_model_a(df: pd.DataFrame, weather, tz_table, seed: int) -> tuple[dict, dict]:
    flown = df.loc[~df.cancelled & ~df.diverted & df.arr_delay.notna()]
    base = F.labels(F.add_calendar(flown, tz_table))
    train, cal, test, split = chronological_split(base)
    enc = F.EncoderTables.fit(train)
    sets = {"train": F.out_of_fold_encode(train), "cal": enc.apply(cal), "test": enc.apply(test)}

    models: dict = {"classifiers": {}, "regressors": {}}
    report: dict = {"split": split, "excluded": {"cancelled": int(df.cancelled.sum()), "diverted": int(df.diverted.sum())}, "stages": {}}
    parity: list = []
    for stage in ("predeparture", "enroute"):
        cols = F.features_for(stage)
        frames = {k: F.stage_frame(v, weather, stage) for k, v in sets.items()}
        X = {k: v[cols].astype(float) for k, v in frames.items()}
        stage_report: dict = {"features": cols, "thresholds": {}}
        models["classifiers"][stage] = {}
        for t in F.THRESHOLDS:
            target = f"y{t}"
            clf = fit_classifier(X["train"], frames["train"][target], seed)
            raw_cal = clf.predict_proba(X["cal"])[:, 1]
            iso, cal_decision = choose_calibration(raw_cal, frames["cal"][target].to_numpy(), frames["cal"]["sched_dep_utc"])
            raw_test = clf.predict_proba(X["test"])[:, 1]
            cal_test = iso.predict(raw_test) if iso is not None else raw_test
            base_fn = route_rate_baseline(frames["train"], target) if stage == "predeparture" else dep_delay_baseline(frames["train"], target)
            y = frames["test"][target].to_numpy()
            exported = export_booster(clf.booster_, "binary")
            calib = isotonic_export(iso) if iso is not None else None
            models["classifiers"][stage][str(t)] = {"model": exported, "calibration": calib, "best_iteration": int(clf.best_iteration_ or 0)}
            base_rep = classification_report(y, base_fn(frames["test"]))
            final_rep = classification_report(y, cal_test)
            stage_report["thresholds"][str(t)] = {
                "baseline": {"name": "historical route rate" if stage == "predeparture" else "rate by departure-delay bucket", **base_rep},
                "gbdt_uncalibrated": classification_report(y, raw_test),
                "gbdt_final": final_rep,
                "calibration": cal_decision,
                "beats_baseline_brier": final_rep["brier"] < base_rep["brier"],
                "trees": len(exported["trees"]),
            }
            # Parity vectors: the TypeScript evaluator must reproduce these numbers.
            rows = X["test"].iloc[:: max(1, len(X["test"]) // 12)].head(12)
            for i, (_, r) in enumerate(rows.iterrows()):
                v = r.to_numpy(dtype=float)
                rs = raw_score(exported, v)
                p_raw = 1 / (1 + np.exp(-rs))
                parity.append({
                    "stage": stage, "threshold": t,
                    "x": [None if np.isnan(z) else float(z) for z in v],
                    "raw_score": rs, "p_calibrated": float(apply_isotonic(calib, np.array([p_raw]))[0]) if calib else float(p_raw),
                    "sklearn_p_raw": float(clf.predict_proba(r.to_frame().T.astype(float))[:, 1][0]),
                })
        # Expected arrival delay (median), clipped to a sensible range for training stability.
        ytr = frames["train"]["arr_delay"].clip(-60, 600)
        reg = fit_regressor(X["train"], ytr, seed)
        pred = reg.predict(X["test"])
        yte = frames["test"]["arr_delay"].to_numpy()
        if stage == "predeparture":
            med = frames["train"].groupby(["origin", "dest"])["arr_delay"].median()
            gmed = float(frames["train"]["arr_delay"].median())
            basepred = np.array([med.get((o, d), gmed) for o, d in zip(frames["test"].origin, frames["test"].dest)])
            base_name = "historical route median"
        else:
            rec = (frames["train"]["arr_delay"] - frames["train"]["dep_delay"]).groupby([frames["train"].origin, frames["train"].dest]).median()
            grec = float((frames["train"]["arr_delay"] - frames["train"]["dep_delay"]).median())
            basepred = frames["test"]["dep_delay"].to_numpy() + np.array([rec.get((o, d), grec) for o, d in zip(frames["test"].origin, frames["test"].dest)])
            base_name = "departure delay plus historical route recovery"
        models["regressors"][stage] = {"model": export_booster(reg.booster_, "regression_l1")}
        stage_report["median_delay"] = {
            "baseline": {"name": base_name, **regression_report(yte, basepred)},
            "gbdt": regression_report(yte, pred),
        }
        report["stages"][stage] = stage_report
    return {"models": models, "encoders": {"tables": enc.tables, "prior": enc.prior}, "parity": parity}, report


def train_model_b(df: pd.DataFrame, tz_table, seed: int) -> tuple[dict | None, dict]:
    pairs = F.rotation_pairs(df)
    pairs = pairs.loc[pairs.dep_delay.notna() & pairs.inbound_arr_delay.notna()]
    if len(pairs) < 2000:
        return None, {
            "status": "skipped",
            "reason": (
                f"Only {len(pairs)} aircraft rotations could be reconstructed. The source must contain both the inbound and "
                "the outbound leg of each rotation with tail numbers (the full BTS table does; nycflights13 has departures "
                "from New York only)."
            ),
        }
    pairs = F.add_calendar(pairs, tz_table)
    pairs["y15"] = (pairs.dep_delay >= 15).astype(float)
    pairs["y60"] = (pairs.dep_delay >= 60).astype(float)
    train, cal, test, split = chronological_split(pairs)
    turn = F.min_turn_table(train)
    enc_fit = train.assign(y15=train.y15, y60=train.y60)
    enc = F.EncoderTables.fit(enc_fit)
    sets = {"train": F.out_of_fold_encode(enc_fit), "cal": enc.apply(cal), "test": enc.apply(test)}
    sets = {k: F.apply_min_turn(v, turn) for k, v in sets.items()}
    cols = F.ROTATION_FEATURES
    X = {k: v[cols].astype(float) for k, v in sets.items()}
    out: dict = {"classifiers": {}, "min_turn": turn, "encoders": {"tables": enc.tables, "prior": enc.prior}}
    report: dict = {"status": "trained", "split": split, "pairs": int(len(pairs)), "features": cols, "thresholds": {}}
    for t in (15, 60):
        target = f"y{t}"
        clf = fit_classifier(X["train"], sets["train"][target], seed)
        iso, cal_decision = choose_calibration(clf.predict_proba(X["cal"])[:, 1], sets["cal"][target].to_numpy(), sets["cal"]["sched_dep_utc"])
        raw = clf.predict_proba(X["test"])[:, 1]
        p = iso.predict(raw) if iso is not None else raw
        y = sets["test"][target].to_numpy()
        # Baseline: deterministic propagation (inbound delay minus slack) turned into a rate per bucket.
        prop = np.maximum(0, sets["train"].inbound_arr_delay - sets["train"].slack_min)
        rates = sets["train"].groupby(np.clip(np.floor(prop / 15), 0, 16))[target].mean()
        bp = np.clip(np.floor(np.maximum(0, sets["test"].inbound_arr_delay - sets["test"].slack_min) / 15), 0, 16).map(rates).fillna(float(sets["train"][target].mean())).to_numpy()
        out["classifiers"][str(t)] = {"model": export_booster(clf.booster_, "binary"), "calibration": isotonic_export(iso) if iso is not None else None}
        report["thresholds"][str(t)] = {"baseline": {"name": "deterministic propagation bucket rate", **classification_report(y, bp)}, "gbdt_final": classification_report(y, p), "calibration": cal_decision}
    return out, report


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--source", choices=["nycflights13", "bts"], required=True)
    ap.add_argument("--data-dir", required=True)
    ap.add_argument("--weather-csv", help="optional hourly weather (origin,time_utc,wind_kmh,visibility_km,precip_mm,temp_c) for BTS")
    ap.add_argument("--out", required=True)
    ap.add_argument("--report", help="where to write the evaluation report (default: next to --out)")
    ap.add_argument("--seed", type=int, default=13)
    args = ap.parse_args(argv)

    started = time.time()
    tz_table = load_tz_table()
    df, weather = load_source(args.source, args.data_dir, tz_table)
    if args.weather_csv:
        weather = pd.read_csv(args.weather_csv, parse_dates=["time_utc"])
    ds = describe(df)
    a_artifact, a_report = train_model_a(df, weather, tz_table, args.seed)
    b_artifact, b_report = train_model_b(df, tz_table, args.seed)

    fingerprint = hashlib.sha256(json.dumps(ds, sort_keys=True).encode()).hexdigest()[:8]
    trained_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    version = f"ripple-{args.source}-{time.strftime('%Y%m%d', time.gmtime())}-{fingerprint}"
    source_text = {
        "nycflights13": "BTS on-time performance, 2013 departures from JFK, LGA and EWR (nycflights13 extract, CC0), with hourly weather observed at those airports",
        "bts": "BTS Reporting Carrier On-Time Performance (transtats.bts.gov)",
    }[args.source]
    summary = {}
    for stage, v in a_report["stages"].items():
        summary[stage] = {
            t: {
                "n": m["gbdt_final"]["n"], "positive_rate": m["gbdt_final"]["positive_rate"],
                "brier": m["gbdt_final"]["brier"], "baseline_brier": m["baseline"]["brier"], "baseline_name": m["baseline"]["name"],
                "auc": m["gbdt_final"]["auc"], "ece": m["gbdt_final"]["ece"], "calibration": m["calibration"]["used"],
                "beats_baseline": m["beats_baseline_brier"],
            }
            for t, m in v["thresholds"].items()
        }
        summary[stage]["median_delay_mae"] = {"model": v["median_delay"]["gbdt"]["mae"], "baseline": v["median_delay"]["baseline"]["mae"]}
    artifact = {
        "schema_version": SCHEMA_VERSION,
        "model_version": version,
        "trained_at": trained_at,
        "dataset": {"source": args.source, "description": source_text, **ds},
        "coverage": {"origins": ds["origins"], "carriers": ds["carriers"]},
        "prediction_horizon_min": F.PREDEPARTURE_HORIZON_MIN,
        "thresholds": list(F.THRESHOLDS),
        "features": {"predeparture": F.PREDEPARTURE_FEATURES, "enroute": F.ENROUTE_FEATURES, "rotation": F.ROTATION_FEATURES},
        "smoothing": F.SMOOTHING,
        "model_a": a_artifact,
        "model_b": b_artifact,
        "evaluation_summary": {"test_period": a_report["split"]["test"], "stages": summary, "model_b": b_report.get("status")},
        "evaluation": {"model_a": a_report, "model_b": b_report},
    }
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(artifact, fh, separators=(",", ":"), allow_nan=False)
    report_path = args.report or os.path.splitext(args.out)[0] + ".evaluation.json"
    with open(report_path, "w", encoding="utf-8") as fh:
        json.dump({"model_version": version, "trained_at": trained_at, "dataset": artifact["dataset"], **artifact["evaluation"]}, fh, indent=2)
    print(f"wrote {args.out} ({os.path.getsize(args.out) / 1e6:.2f} MB) and {report_path} in {time.time() - started:.0f}s")


if __name__ == "__main__":
    main()
