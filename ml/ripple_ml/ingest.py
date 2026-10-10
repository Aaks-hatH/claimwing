"""
Data ingestion: turn a historical flight-outcome source into one canonical table.

Supported sources
-----------------
* ``bts``: U.S. Bureau of Transportation Statistics "Reporting Carrier On-Time Performance
  (1987-present)" monthly CSV files, downloaded from https://www.transtats.bts.gov/ (PREZIP).
  These contain both directions of every covered flight with tail numbers, so aircraft
  rotations can be reconstructed. Public domain (U.S. government work).
* ``nycflights13``: the nycflights13 dataset (Wickham, CC0), which is a 2013 extract of the
  same BTS table for departures from JFK, LGA and EWR, plus hourly weather observed at those
  three airports. Departures only, so rotations cannot be reconstructed from it.

Canonical columns
-----------------
flight_date (date, local at origin), carrier, flight_number, tail, origin, dest,
sched_dep_local (naive local datetime), sched_dep_utc, sched_arr_utc (tz-aware UTC),
dep_delay, arr_delay (minutes, NaN when unknown), cancelled, diverted (bool), distance_km.
"""
from __future__ import annotations

import glob
import json
import os
from typing import Iterable

import numpy as np
import pandas as pd

MILES_TO_KM = 1.609344

CANONICAL = [
    "flight_date", "carrier", "flight_number", "tail", "origin", "dest",
    "sched_dep_local", "sched_dep_utc", "sched_arr_utc", "dep_delay", "arr_delay",
    "cancelled", "diverted", "distance_km",
]


def load_tz_table(repo_airports_json: str | None = None, extra: dict[str, str] | None = None) -> dict[str, str]:
    """IATA code -> IANA time zone, from ClaimWing's own reference data (data/airports.json)."""
    table: dict[str, str] = {}
    path = repo_airports_json or os.path.join(os.path.dirname(__file__), "..", "..", "data", "airports.json")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as fh:
            for a in json.load(fh):
                if a.get("iata") and a.get("tz"):
                    table[a["iata"]] = a["tz"]
    if extra:
        table.update({k: v for k, v in extra.items() if isinstance(v, str) and v})
    return table


def _hhmm_to_minutes(v: pd.Series) -> pd.Series:
    v = pd.to_numeric(v, errors="coerce")
    v = v.where(v != 2400, 0)
    return (v // 100) * 60 + (v % 100)


def _localize(dates: pd.Series, minutes: pd.Series, tz_codes: pd.Series, tz_table: dict[str, str]) -> pd.Series:
    """Local wall-clock (date + minutes after midnight) at each airport -> UTC instant."""
    naive = pd.to_datetime(dates) + pd.to_timedelta(minutes, unit="m")
    out = pd.Series(pd.NaT, index=naive.index, dtype="datetime64[ns, UTC]")
    tzs = tz_codes.map(tz_table)
    for tz, idx in tzs.groupby(tzs).groups.items():
        loc = naive.loc[idx].dt.tz_localize(tz, ambiguous="NaT", nonexistent="shift_forward")
        out.loc[idx] = loc.dt.tz_convert("UTC")
    return out


def _finish(df: pd.DataFrame, dep_min: pd.Series, arr_min: pd.Series, tz_table: dict[str, str]) -> pd.DataFrame:
    df["sched_dep_local"] = pd.to_datetime(df["flight_date"]) + pd.to_timedelta(dep_min, unit="m")
    df["sched_dep_utc"] = _localize(df["flight_date"], dep_min, df["origin"], tz_table)
    arr = _localize(df["flight_date"], arr_min, df["dest"], tz_table)
    # Arrival clock times are given without a date. If the local arrival time falls before the
    # departure instant, the flight arrived on a later day (overnight or across the date line).
    for _ in range(2):
        behind = arr <= df["sched_dep_utc"]
        arr = arr.where(~behind, arr + pd.Timedelta(days=1))
    df["sched_arr_utc"] = arr
    missing_tz = df["sched_dep_utc"].isna() | df["sched_arr_utc"].isna()
    df = df.loc[~missing_tz].copy()
    df["flight_date"] = pd.to_datetime(df["flight_date"]).dt.date
    return df[CANONICAL].sort_values("sched_dep_utc").reset_index(drop=True)


def load_nycflights13(data_dir: str, tz_table: dict[str, str]) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Returns (flights, weather). ``data_dir`` holds flights.csv(.zip), weather.csv and airports.csv."""
    fpath = next(p for p in [os.path.join(data_dir, "flights.csv.zip"), os.path.join(data_dir, "flights.csv")] if os.path.exists(p))
    f = pd.read_csv(fpath)
    ap = pd.read_csv(os.path.join(data_dir, "airports.csv"))
    tz_table = {**{r.faa: r.tzone for r in ap.itertuples() if isinstance(r.tzone, str)}, **tz_table}
    df = pd.DataFrame({
        "flight_date": pd.to_datetime(dict(year=f.year, month=f.month, day=f.day)),
        "carrier": f.carrier.astype(str),
        "flight_number": f.flight.astype(str),
        "tail": f.tailnum.astype("string"),
        "origin": f.origin.astype(str),
        "dest": f.dest.astype(str),
        "dep_delay": pd.to_numeric(f.dep_delay, errors="coerce"),
        "arr_delay": pd.to_numeric(f.arr_delay, errors="coerce"),
        "cancelled": f.dep_time.isna(),
        "diverted": f.dep_time.notna() & f.arr_delay.isna(),
        "distance_km": f.distance * MILES_TO_KM,
    })
    df = _finish(df, _hhmm_to_minutes(f.sched_dep_time), _hhmm_to_minutes(f.sched_arr_time), tz_table)
    w = pd.read_csv(os.path.join(data_dir, "weather.csv"))
    weather = pd.DataFrame({
        "origin": w.origin,
        "time_utc": pd.to_datetime(w.time_hour, utc=True),
        # Converted to the units ClaimWing gets from Open-Meteo at inference time.
        "wind_kmh": w.wind_speed * MILES_TO_KM,
        "visibility_km": (w.visib * MILES_TO_KM).clip(upper=16),
        "precip_mm": w.precip * 25.4,
        "temp_c": (w.temp - 32) * 5 / 9,
    }).dropna(subset=["time_utc"])
    return df, weather


BTS_COLUMNS = {
    "FlightDate": "flight_date", "Reporting_Airline": "carrier", "Flight_Number_Reporting_Airline": "flight_number",
    "Tail_Number": "tail", "Origin": "origin", "Dest": "dest", "DepDelay": "dep_delay", "ArrDelay": "arr_delay",
    "Cancelled": "cancelled", "Diverted": "diverted", "Distance": "distance_mi", "CRSDepTime": "crs_dep", "CRSArrTime": "crs_arr",
}


def load_bts(paths: Iterable[str], tz_table: dict[str, str]) -> pd.DataFrame:
    """Reads BTS monthly CSV (or zipped CSV) files. Only the columns listed in BTS_COLUMNS are used."""
    frames = []
    for p in paths:
        raw = pd.read_csv(p, usecols=lambda c: c in BTS_COLUMNS, dtype={"Tail_Number": "string"}, low_memory=False)
        missing = set(BTS_COLUMNS) - set(raw.columns)
        if missing:
            raise ValueError(f"{p} is missing BTS columns {sorted(missing)}; download the 'Reporting Carrier On-Time Performance' table")
        frames.append(raw.rename(columns=BTS_COLUMNS))
    if not frames:
        raise FileNotFoundError("no BTS files matched")
    r = pd.concat(frames, ignore_index=True)
    df = pd.DataFrame({
        "flight_date": pd.to_datetime(r.flight_date),
        "carrier": r.carrier.astype(str),
        "flight_number": r.flight_number.astype(str),
        "tail": r["tail"].astype("string").str.strip().replace({"": pd.NA}),
        "origin": r.origin.astype(str),
        "dest": r.dest.astype(str),
        "dep_delay": pd.to_numeric(r.dep_delay, errors="coerce"),
        "arr_delay": pd.to_numeric(r.arr_delay, errors="coerce"),
        "cancelled": r.cancelled.astype(float) > 0,
        "diverted": r.diverted.astype(float) > 0,
        "distance_km": pd.to_numeric(r.distance_mi, errors="coerce") * MILES_TO_KM,
    })
    return _finish(df, _hhmm_to_minutes(r.crs_dep), _hhmm_to_minutes(r.crs_arr), tz_table)


def load_source(source: str, data_dir: str, tz_table: dict[str, str] | None = None) -> tuple[pd.DataFrame, pd.DataFrame | None]:
    tz_table = tz_table if tz_table is not None else load_tz_table()
    if source == "nycflights13":
        return load_nycflights13(data_dir, tz_table)
    if source == "bts":
        paths = sorted(glob.glob(os.path.join(data_dir, "*.csv")) + glob.glob(os.path.join(data_dir, "*.zip")))
        return load_bts(paths, tz_table), None
    raise ValueError(f"unknown source {source!r}")


def describe(df: pd.DataFrame) -> dict:
    return {
        "rows": int(len(df)),
        "first_date": str(min(df.flight_date)),
        "last_date": str(max(df.flight_date)),
        "origins": sorted(df.origin.unique().tolist()),
        "carriers": sorted(df.carrier.unique().tolist()),
        "cancelled": int(df.cancelled.sum()),
        "diverted": int(df.diverted.sum()),
        "tail_coverage": float(np.mean(df["tail"].notna())),
    }
