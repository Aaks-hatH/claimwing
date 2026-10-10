"""
Tests for the training pipeline on a small synthetic data set built in the test
(no downloads; numbers here are not real flights).

Run from the ml/ directory:  python -m pytest tests
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from ripple_ml import features as F
from ripple_ml.export import _flatten, raw_score
from ripple_ml.ingest import _finish, _hhmm_to_minutes, load_tz_table
from ripple_ml.train import chronological_split

TZ = {"JFK": "America/New_York", "BOS": "America/New_York", "LAX": "America/Los_Angeles", "LHR": "Europe/London"}


def synthetic(n_days: int = 60, seed: int = 0) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    rows = []
    start = pd.Timestamp("2025-01-01")
    for d in range(n_days):
        date = start + pd.Timedelta(days=d)
        for tail in ("N1", "N2"):
            # A daily rotation: JFK-BOS, BOS-JFK, JFK-LAX.
            dep1 = 7 * 60 + (0 if tail == "N1" else 30)
            delay1 = float(rng.choice([0, 5, 30, 90]))
            arr_delay1 = delay1 + rng.normal(0, 5)
            rows.append(dict(date=date, carrier="ZZ", flight="1" + tail[-1], tail=tail, origin="JFK", dest="BOS", dep=dep1, arr=dep1 + 75, dep_delay=delay1, arr_delay=arr_delay1))
            dep2 = dep1 + 75 + 45
            delay2 = max(0.0, arr_delay1 - 25) + rng.normal(0, 3)
            rows.append(dict(date=date, carrier="ZZ", flight="2" + tail[-1], tail=tail, origin="BOS", dest="JFK", dep=dep2, arr=dep2 + 80, dep_delay=delay2, arr_delay=delay2 + rng.normal(0, 5)))
            dep3 = dep2 + 80 + 60
            rows.append(dict(date=date, carrier="ZZ", flight="3" + tail[-1], tail=tail, origin="JFK", dest="LAX", dep=dep3, arr=(dep3 + 6 * 60 - 3 * 60) % (24 * 60), dep_delay=0.0, arr_delay=rng.normal(5, 10)))
    r = pd.DataFrame(rows)
    df = pd.DataFrame({
        "flight_date": r.date, "carrier": r.carrier, "flight_number": r.flight, "tail": r["tail"].astype("string"),
        "origin": r.origin, "dest": r.dest, "dep_delay": r.dep_delay, "arr_delay": r.arr_delay,
        "cancelled": False, "diverted": False, "distance_km": 300.0,
    })
    dep_min = r.dep  # minutes after midnight
    return _finish(df, dep_min, r.arr, TZ)


def test_hhmm_and_2400():
    assert _hhmm_to_minutes(pd.Series([0, 515, 2359, 2400])).tolist() == [0, 315, 1439, 0]


def test_overnight_and_timezone_arrival():
    df = synthetic(2)
    lax = df.loc[df.dest == "LAX"].iloc[0]
    # Scheduled block must be positive and roughly 6 hours even though LAX is 3 hours behind.
    block = (lax.sched_arr_utc - lax.sched_dep_utc).total_seconds() / 3600
    assert 5.5 < block < 6.5


def test_chronological_split_has_embargo_and_no_overlap():
    df = synthetic(120)
    train, cal, test, info = chronological_split(df)
    assert train.sched_dep_utc.max() < cal.sched_dep_utc.min() - pd.Timedelta(days=6)
    assert cal.sched_dep_utc.max() < test.sched_dep_utc.min() - pd.Timedelta(days=6)
    # The same daily flight never appears on the same calendar day in two splits.
    assert not (set(train.flight_date) & set(test.flight_date))


def test_encodings_never_use_evaluation_outcomes():
    df = F.labels(F.add_calendar(synthetic(120), TZ))
    train, cal, test, _ = chronological_split(df)
    enc = F.EncoderTables.fit(train)
    before = enc.apply(test)
    flipped = test.copy()
    flipped["y15"] = 1 - flipped["y15"]
    flipped["arr_delay"] = -flipped["arr_delay"]
    after = enc.apply(flipped)
    for c in F.ENC_FEATURES:
        assert np.allclose(before[c], after[c]), c


def test_out_of_fold_encoding_excludes_own_block():
    df = F.labels(F.add_calendar(synthetic(100), TZ))
    oof = F.out_of_fold_encode(df, folds=5)
    full = F.EncoderTables.fit(df).apply(df)
    # Out-of-fold values differ from in-sample values (which would contain each row's own label).
    assert not np.allclose(oof["flight_r15"], full["flight_r15"])


def test_predeparture_features_exclude_outcomes():
    assert "dep_delay" not in F.PREDEPARTURE_FEATURES
    assert "arr_delay" not in F.ENROUTE_FEATURES
    assert not any("air_time" in c for c in F.ENROUTE_FEATURES)


def test_weather_is_taken_at_or_before_prediction_time():
    df = synthetic(3)
    w = pd.DataFrame({
        "origin": ["JFK", "JFK"],
        "time_utc": [df.sched_dep_utc.iloc[0] - pd.Timedelta(hours=3), df.sched_dep_utc.iloc[0] + pd.Timedelta(minutes=30)],
        "wind_kmh": [10.0, 99.0], "visibility_km": [16.0, 1.0], "precip_mm": [0.0, 9.0], "temp_c": [5.0, 5.0],
    })
    out = F.stage_frame(df.head(1), w, "predeparture")
    assert out.wx_wind_kmh.iloc[0] == 10.0  # the later (future) observation is never used


def test_rotation_pairs_link_by_tail_and_airport_only():
    df = synthetic(5)
    pairs = F.rotation_pairs(df)
    assert len(pairs) == 5 * 2 * 2  # two links per tail per day
    assert (pairs.origin.isin(["BOS", "JFK"])).all()
    # Removing tail numbers removes every link, even though routes mirror each other.
    no_tail = df.assign(tail=pd.NA)
    assert len(F.rotation_pairs(no_tail)) == 0


def test_rotation_pairs_respect_ground_time_bounds():
    df = synthetic(2)
    shifted = df.copy()
    m = shifted.origin.eq("BOS")
    shifted.loc[m, "sched_dep_utc"] = shifted.loc[m, "sched_dep_utc"] + pd.Timedelta(hours=13)
    assert F.rotation_pairs(shifted).query("origin == 'BOS'").empty


def test_tree_export_matches_lightgbm():
    lgb = pytest.importorskip("lightgbm")
    rng = np.random.default_rng(1)
    X = rng.normal(size=(2000, 4))
    X[rng.random(2000) < 0.1, 2] = np.nan
    y = (X[:, 0] + np.nan_to_num(X[:, 2]) > 0).astype(int)
    clf = lgb.LGBMClassifier(n_estimators=20, num_leaves=7, verbose=-1).fit(X, y)
    dump = clf.booster_.dump_model()
    model = {"trees": [_flatten(t) for t in dump["tree_info"]]}
    for row in X[:50]:
        expected = clf.booster_.predict(row.reshape(1, -1), raw_score=True)[0]
        assert raw_score(model, row) == pytest.approx(expected, abs=1e-9)


def test_tz_table_comes_from_reference_data():
    tz = load_tz_table()
    assert tz.get("LHR") == "Europe/London"


def test_model_b_trains_when_rotations_exist_and_skips_otherwise():
    pytest.importorskip("lightgbm")
    from ripple_ml.train import train_model_b

    df = synthetic(700, seed=3)
    art, rep = train_model_b(df, TZ, seed=1)
    assert rep["status"] == "trained" and art is not None
    assert set(art["classifiers"]) == {"15", "60"}
    assert "ZZ|BOS" in art["min_turn"]
    # Knock-on delay is learnable here because the fixture propagates inbound lateness.
    assert rep["thresholds"]["15"]["gbdt_final"]["auc"] > 0.8

    departures_only = df.loc[df.origin == "JFK"]
    art2, rep2 = train_model_b(departures_only, TZ, seed=1)
    assert art2 is None and rep2["status"] == "skipped"
