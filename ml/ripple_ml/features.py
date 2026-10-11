"""
Feature engineering. Every feature must be knowable at the moment the prediction is made.

Prediction stages
-----------------
* ``predeparture``: made 2 hours before scheduled departure. Uses the schedule, calendar,
  historical statistics from the training period, and weather observed at the prediction time.
* ``enroute``: made once the aircraft has left the gate. Adds the actual departure delay and
  weather at the actual departure time. Never uses the arrival time or air time.

Historical statistics (target encodings) are computed from the training period only. Rows inside
the training period receive out-of-fold values (computed without their own time block), so a
row's own outcome never leaks into its features. Evaluation rows use the full training tables.

Vola's TypeScript inference (lib/ripple/model.ts) recomputes these features with the same
definitions; the exported artifact contains parity vectors that the TypeScript tests check.
"""
from __future__ import annotations

import math

import numpy as np
import pandas as pd

PREDEPARTURE_HORIZON_MIN = 120
SMOOTHING = 30.0  # pseudo-count pulling small groups toward the overall rate
THRESHOLDS = (15, 60, 180)

ENCODINGS = {
    "carrier": ["carrier"],
    "route": ["origin", "dest"],
    "origin_hour": ["origin", "dep_hour_int"],
    "flight": ["carrier", "flight_number", "origin"],
}

BASE_FEATURES = [
    "month", "dow", "dep_hour", "arr_hour", "distance_km", "sched_block_min",
    "wx_wind_kmh", "wx_visibility_km", "wx_precip_mm", "wx_temp_c",
]
ENC_FEATURES = [
    "carrier_r15", "carrier_r60", "route_r15", "route_r60", "route_logn",
    "origin_hour_r15", "origin_hour_r60", "flight_r15", "flight_r60", "flight_logn",
]
PREDEPARTURE_FEATURES = BASE_FEATURES + ENC_FEATURES
ENROUTE_FEATURES = PREDEPARTURE_FEATURES + ["dep_delay"]


def key_of(df: pd.DataFrame, cols: list[str]) -> pd.Series:
    return df[cols].astype(str).agg("|".join, axis=1)


def add_calendar(df: pd.DataFrame, tz_table: dict[str, str]) -> pd.DataFrame:
    out = df.copy()
    local = pd.to_datetime(out["sched_dep_local"])
    out["month"] = local.dt.month.astype(float)
    out["dow"] = local.dt.dayofweek.astype(float)  # Monday = 0
    out["dep_hour"] = local.dt.hour + local.dt.minute / 60.0
    out["dep_hour_int"] = local.dt.hour.astype(int)
    arr_hour = pd.Series(np.nan, index=out.index)
    tzs = out["dest"].map(tz_table)
    for tz, idx in tzs.groupby(tzs).groups.items():
        loc = out.loc[idx, "sched_arr_utc"].dt.tz_convert(tz)
        arr_hour.loc[idx] = loc.dt.hour + loc.dt.minute / 60.0
    out["arr_hour"] = arr_hour
    out["sched_block_min"] = (out["sched_arr_utc"] - out["sched_dep_utc"]).dt.total_seconds() / 60.0
    return out


def add_weather(df: pd.DataFrame, weather: pd.DataFrame | None, at_col: str) -> pd.DataFrame:
    """Weather observed at the origin at or before ``at_col`` (within 3 hours)."""
    out = df.copy()
    cols = {"wind_kmh": "wx_wind_kmh", "visibility_km": "wx_visibility_km", "precip_mm": "wx_precip_mm", "temp_c": "wx_temp_c"}
    if weather is None or weather.empty:
        for c in cols.values():
            out[c] = np.nan
        return out
    w = weather.sort_values("time_utc").rename(columns=cols)
    left = out[["origin", at_col]].copy()
    left["_row"] = np.arange(len(left))
    left = left.sort_values(at_col)
    left[at_col] = left[at_col].astype("datetime64[ns, UTC]")
    w["time_utc"] = w["time_utc"].astype("datetime64[ns, UTC]")
    merged = pd.merge_asof(left, w, left_on=at_col, right_on="time_utc", by="origin", direction="backward", tolerance=pd.Timedelta(hours=3))
    merged = merged.sort_values("_row")
    for c in cols.values():
        out[c] = merged[c].to_numpy()
    return out


def labels(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    for t in THRESHOLDS:
        out[f"y{t}"] = (out["arr_delay"] >= t).astype(float)
    return out


class EncoderTables:
    """Smoothed historical rates per key. Fitted on training rows only."""

    def __init__(self, tables: dict[str, dict[str, list[float]]], prior: dict[str, float]):
        self.tables = tables  # name -> key -> [n, rate15, rate60]
        self.prior = prior

    @staticmethod
    def fit(train: pd.DataFrame) -> "EncoderTables":
        prior = {"r15": float(train["y15"].mean()), "r60": float(train["y60"].mean())}
        tables: dict[str, dict[str, list[float]]] = {}
        for name, cols in ENCODINGS.items():
            g = train.assign(_k=key_of(train, cols)).groupby("_k").agg(n=("y15", "size"), s15=("y15", "sum"), s60=("y60", "sum"))
            tables[name] = {
                k: [int(r.n), round(_smooth(r.s15, r.n, prior["r15"]), 6), round(_smooth(r.s60, r.n, prior["r60"]), 6)]
                for k, r in g.iterrows()
            }
        return EncoderTables(tables, prior)

    def apply(self, df: pd.DataFrame) -> pd.DataFrame:
        out = df.copy()
        for name, cols in ENCODINGS.items():
            keys = key_of(out, cols)
            table = self.tables[name]
            vals = keys.map(lambda k: table.get(k))
            out[f"{name}_r15"] = vals.map(lambda v: v[1] if v else self.prior["r15"])
            out[f"{name}_r60"] = vals.map(lambda v: v[2] if v else self.prior["r60"])
            out[f"{name}_logn"] = vals.map(lambda v: math.log1p(v[0]) if v else 0.0)
        return out


def _smooth(s: float, n: float, prior: float) -> float:
    return (s + SMOOTHING * prior) / (n + SMOOTHING)


def out_of_fold_encode(train: pd.DataFrame, folds: int = 5) -> pd.DataFrame:
    """Encodes each contiguous time block of the training set with tables fitted on the other blocks."""
    order = train["sched_dep_utc"].rank(method="first")
    block = np.minimum((order - 1) * folds // len(train), folds - 1).astype(int)
    parts = []
    for b in range(folds):
        mask = block == b
        enc = EncoderTables.fit(train.loc[~mask])
        parts.append(enc.apply(train.loc[mask]))
    return pd.concat(parts).loc[train.index]


def stage_frame(df: pd.DataFrame, weather: pd.DataFrame | None, stage: str) -> pd.DataFrame:
    """Adds the weather features appropriate to the prediction stage."""
    out = df.copy()
    if stage == "predeparture":
        out["_pred_at"] = out["sched_dep_utc"] - pd.Timedelta(minutes=PREDEPARTURE_HORIZON_MIN)
    elif stage == "enroute":
        out["_pred_at"] = out["sched_dep_utc"] + pd.to_timedelta(out["dep_delay"].fillna(0), unit="m")
    else:
        raise ValueError(stage)
    return add_weather(out, weather, "_pred_at")


def features_for(stage: str) -> list[str]:
    return PREDEPARTURE_FEATURES if stage == "predeparture" else ENROUTE_FEATURES


# ---------------------------------------------------------------------------------------------
# Model B: aircraft rotations
# ---------------------------------------------------------------------------------------------
ROTATION_FEATURES = [
    "inbound_arr_delay", "sched_ground_min", "slack_min", "min_turn_est",
    "month", "dow", "dep_hour", "distance_km", "carrier_r15", "carrier_r60", "origin_hour_r15",
]
MIN_GROUND_MIN = 20
MAX_GROUND_MIN = 600


def rotation_pairs(df: pd.DataFrame) -> pd.DataFrame:
    """
    Consecutive legs flown by the same tail number where the inbound leg arrives at the airport
    the outbound leg departs from, with a plausible scheduled ground time. Flights are never linked
    because they share a flight number or because their routes are mirror images; only the tail
    number and airport continuity count.
    """
    legs = df.loc[df["tail"].notna() & (df["tail"].astype(str).str.len() > 1)].sort_values(["tail", "sched_dep_utc"])
    nxt = legs.groupby("tail").shift(-1)
    ground = (nxt["sched_dep_utc"] - legs["sched_arr_utc"]).dt.total_seconds() / 60.0
    ok = (
        nxt["origin"].eq(legs["dest"])
        & ground.between(MIN_GROUND_MIN, MAX_GROUND_MIN)
        & ~legs["cancelled"]
        & ~nxt["cancelled"].astype(bool)
    )
    inbound = legs.loc[ok]
    outbound = nxt.loc[ok]
    pairs = outbound.copy()
    pairs["inbound_arr_delay"] = inbound["arr_delay"].to_numpy()
    pairs["sched_ground_min"] = ground.loc[ok].to_numpy()
    pairs["inbound_flight"] = (inbound["carrier"] + inbound["flight_number"]).to_numpy()
    return pairs.reset_index(drop=True)


def min_turn_table(pairs_train: pd.DataFrame) -> dict[str, float]:
    """Typical short turnaround per carrier and airport: the 10th percentile of scheduled ground time."""
    g = pairs_train.groupby(["carrier", "origin"])["sched_ground_min"].quantile(0.10)
    out = {f"{c}|{o}": float(v) for (c, o), v in g.items()}
    out["*"] = float(pairs_train["sched_ground_min"].quantile(0.10))
    return out


def apply_min_turn(pairs: pd.DataFrame, table: dict[str, float]) -> pd.DataFrame:
    out = pairs.copy()
    keys = out["carrier"].astype(str) + "|" + out["origin"].astype(str)
    out["min_turn_est"] = keys.map(lambda k: table.get(k, table["*"]))
    out["slack_min"] = out["sched_ground_min"] - out["min_turn_est"]
    return out
