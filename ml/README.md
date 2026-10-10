# Flight Ripple models

This folder trains the delay models behind Flight Ripple and exports them to
`data/models/ripple-model.json`. The app evaluates that file in TypeScript
(`lib/ripple/gbdt.ts`, `lib/ripple/model-core.ts`), so production needs no Python and no
separate inference service. If the file is missing or invalid, Flight Ripple keeps working
with its labelled rule-based estimate.

## What is trained

| Model | Predicts | When | Features |
| --- | --- | --- | --- |
| A, pre-departure | P(arrival delay at least 15, 60, 180 min) and the median arrival delay | 2 hours before scheduled departure | airline, route, day and time, season, scheduled block time, distance, historical rates from the training period, weather observed at prediction time |
| A, en route | the same | once the aircraft has left the gate | the above plus the actual departure delay |
| B, propagation | P(next leg departs at least 15 or 60 min late) | before the next leg departs | inbound arrival delay, scheduled ground time, slack over a measured short turnaround, airline and airport history |

Every model is compared with a simple baseline on the same test period:
historical route rate (A pre-departure), rate by departure-delay bucket (A en route),
historical route median and "departure delay plus typical recovery" (median delay), and a
deterministic propagation rule (B).

## Data

### Option 1: nycflights13 (used for the shipped artifact)

The `nycflights13` dataset (Hadley Wickham, CC0) is a 2013 extract of the U.S. Bureau of
Transportation Statistics (BTS) on-time table for all departures from JFK, LGA and EWR,
with tail numbers, plus hourly weather observed at those airports.

```bash
pip download --no-deps nycflights13==0.0.3 -d /tmp/nyc && tar -xzf /tmp/nyc/nycflights13-0.0.3.tar.gz -C /tmp/nyc
DATA=/tmp/nyc/nycflights13-0.0.3/nycflights13/data
```

Coverage: departures from New York only, 2013, the 16 airlines that flew them. The app
refuses to use the model for any other origin or airline. Because it has departures only,
aircraft rotations cannot be rebuilt from it, so Model B is skipped and the artifact says so.

### Option 2: full BTS data (enables Model B)

Download monthly files of "Reporting Carrier On-Time Performance (1987-present)" from
https://www.transtats.bts.gov/ (Download page, or the PREZIP folder), unzip the CSVs into one
directory, and pass `--source bts`. BTS data is a U.S. government work in the public domain.
Required columns: FlightDate, Reporting_Airline, Flight_Number_Reporting_Airline,
Tail_Number, Origin, Dest, CRSDepTime, CRSArrTime, DepDelay, ArrDelay, Cancelled, Diverted,
Distance. BTS has no weather; pass `--weather-csv` with hourly observations
(origin, time_utc, wind_kmh, visibility_km, precip_mm, temp_c) if you have them.

## Reproduce

```bash
cd ml
pip install -r requirements.txt
python -m ripple_ml.train --source nycflights13 --data-dir $DATA --out ../data/models/ripple-model.json
# or: python -m ripple_ml.train --source bts --data-dir /path/to/bts --out ../data/models/ripple-model.json
python -m pytest tests            # pipeline tests (synthetic data, no download)
cd .. && npx vitest run tests/ripple.test.ts   # TypeScript parity with the Python reference
```

`npm run ml:train` and `npm run ml:test` wrap the same commands.

## Method

- **Chronological split** with a 7-day embargo: oldest ~68% train, next ~16% calibration,
  newest ~16% test. The embargo keeps the same daily flight from sitting on both sides of a
  boundary. Every reported metric is on the test period.
- **No leakage.** Pre-departure features exclude every outcome. En-route features add only
  the departure delay. Historical rates are fitted on the training period; training rows get
  out-of-fold values computed without their own time block. Weather is the latest observation
  at or before the prediction time. `tests/test_pipeline.py` checks each of these.
- **Calibration** (isotonic) is used only if it improves log loss on the second half of the
  calibration period, fitted on the first half. The test period is never used to choose.
- **Cancelled and diverted flights** have no arrival delay and are excluded from Model A
  (counts are in the report).
- **Export.** LightGBM trees are flattened to arrays; the artifact includes parity vectors,
  and the TypeScript tests require identical scores.

## Results (shipped artifact)

`data/models/ripple-model.evaluation.json` has the full report (reliability tables,
precision and recall, error by delay size). Test period 10 Nov to 31 Dec 2013, 45,923 flights.

| Stage | Threshold | Positive rate | Brier (model) | Brier (baseline) | AUC (model) | AUC (baseline) |
| --- | --- | --- | --- | --- | --- | --- |
| Pre-departure | 15 min | 27.4% | 0.1979 | 0.1983 | 0.652 | 0.544 |
| Pre-departure | 60 min | 8.3% | 0.0737 | 0.0756 | 0.700 | 0.581 |
| Pre-departure | 180 min | 1.0% | 0.0099 | 0.0099 | 0.726 | 0.573 |
| En route | 15 min | 27.4% | 0.0945 | 0.1027 | 0.899 | 0.864 |
| En route | 60 min | 8.3% | 0.0203 | 0.0212 | 0.983 | 0.975 |
| En route | 180 min | 1.0% | 0.0023 | 0.0020 | 0.987 | 0.999 |

Reading these honestly:

- Pre-departure forecasts rank flights better than the route average (higher AUC) but their
  probabilities are only slightly better (Brier skill under 3%). Delays two hours out are
  mostly not predictable from schedule, history and weather alone. The 15-minute model is
  also poorly calibrated on the test period (ECE 0.10) because December 2013 was much more
  delayed than the autumn calibration period.
- En-route forecasts are strong, mostly because the departure delay is known.
- The en-route 180-minute model does **not** beat its baseline, so the app hides that one
  probability and says why.
- Median-delay error: pre-departure MAE 23.9 min (baseline 24.5); en route 12.5 min
  (baseline 12.9). Large delays are under-predicted.
- The data is from 2013 and covers New York departures only. Treat it as a demonstration
  that the pipeline is real and measured, not as a production-grade forecaster. Training on
  recent full BTS data is the next step.
