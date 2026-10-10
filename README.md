# ClaimWing

Evidence for delayed flights and damaged bags. ClaimWing tracks a flight live, photographs a checked bag before and after, estimates eligibility under EU261, UK261, US DOT rules and the Montreal Convention, and exports one evidence packet (PDF) plus a ZIP of untouched originals.

**Flight Ripple** forecasts delays from three connected sources: passengers on the same flight reporting what they see, the aircraft flying in before yours (and after it), and a gradient-boosted model trained on historical outcomes. Every result says whether it came from the trained model, a rule-based estimate or a simulation, and what data was missing.

The **Demo Center** (`/demo`, no account needed) replays six deterministic, clearly simulated scenarios through the real algorithms: a three-flight delay cascade, conflicting passenger reports, an aircraft swap, a provider outage, a bag damage investigation and claim preparation.

**Documentation support, not legal advice.** Eligibility results are automated estimates. ClaimWing never contacts an airline on the user's behalf.

---

## Quick start (local)

Requirements: Node.js 20.9+ (22 recommended) and a MongoDB 4.4+ database (MongoDB Atlas free tier is fine).

```bash
npm install
cp .env.example .env.local     # then fill in MONGODB_URI and AUTH_SECRET at minimum
npx auth secret                # prints a value for AUTH_SECRET (or: openssl rand -base64 32)
npm run seed                   # optional: demo account + demo trip
npm run dev                    # http://localhost:3000
```

Demo login after seeding: `demo@claimwing.app` / `claimwing-demo-2026` (change with `SEED_PASSWORD`).

## Environment variables

Everything is documented in [`.env.example`](.env.example). The important ones:

| Variable | Needed for |
|---|---|
| `MONGODB_URI` | **Required.** All data, and photos (GridFS) by default |
| `AUTH_SECRET` | **Required.** Signs session cookies |
| `AUTH_URL` | Public URL, e.g. `https://claimwing.fly.dev` (OAuth callbacks) |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | Google sign-in (optional). Redirect URI: `{AUTH_URL}/api/auth/callback/google` |
| `AERODATABOX_RAPIDAPI_KEY` | Scheduled, actual (gate) and runway times, aircraft transponder lookup, the "find flight" button. Strongly recommended |
| `AVIATIONSTACK_KEY` | Alternative schedule source (free plan: HTTP only, small quota) |
| `OPENSKY_CLIENT_ID`, `OPENSKY_CLIENT_SECRET` | Higher OpenSky quota (optional; airplanes.live is used first and needs no key) |
| `CRON_SECRET` | Protects `/api/cron/poll` (background tracking + deadline reminders) |
| `INTERNAL_CRON=true` | Poll in-process every 2 minutes on long-running servers instead of an external cron |
| `ANTHROPIC_API_KEY` | AI damage suggestions and letter polish (optional) |
| `STORAGE_DRIVER` | `gridfs` (default) or `local` |
| `DEMO_MODE` | `true` (default) shows the clearly labelled **Demo replay** button; set `false` to hide it for a public launch. The Demo Center at `/demo` is always available and never touches stored data |
| `RIPPLE_MODEL_PATH` | Path to the trained Flight Ripple model (default `data/models/ripple-model.json`) |
| `RIPPLE_MODEL_DISABLED=true` | Turn the trained model off; Flight Ripple then uses only its labelled rule-based estimate |

Check a running deployment at `GET /api/health` (config + database). Signed in, `GET /api/health?deep=1` also makes one real call to each flight data source.

## How flight data works

| Source | What it gives | Limits |
|---|---|---|
| Schedule API (AeroDataBox or AviationStack) | Scheduled, revised/actual gate times, runway times, status, aircraft Mode-S hex | Your plan's quota. Cached and shared across users; at most one call per flight per `SCHEDULE_TTL_SECONDS` while active |
| airplanes.live | Live ADS-B position by hex or callsign | ~1 request/second, non-commercial use |
| OpenSky Network | Live ADS-B position by hex (fallback) | 400 credits/day anonymous, 4,000 with an API client. Non-commercial use |
| Open-Meteo | Weather model data at both airports for cause context | Free, no key |
| Demo replay | A stored flight replayed ~90x faster | Always labelled "Demo replay", including in the PDF |

Tracking runs from 3 hours before scheduled departure until the arrival is final. The Flight tab polls every 20 s while open; `/api/cron/poll` (or `INTERNAL_CRON`) keeps polling when nobody is watching.

**Delay measurement.** Legally, arrival is when a door opens (CJEU, *Germanwings* C-452/13). ClaimWing stores every candidate time with its source and uses, in order: the time the passenger entered, the gate arrival from the schedule API, the runway time, the first on-ground ADS-B report, the last ADS-B contact. Results within 15 minutes of the 3-hour threshold based on anything other than a gate or passenger-entered time are marked **Needs review** instead of being decided.

## Eligibility rules

Rules are configuration in `lib/rules/config.ts`; the engine (`lib/rules/engine.ts`) is pure and unit tested.

- **EU261**: departure from the EU/EEA/Switzerland (any airline), or arrival there on an EU/EEA/Swiss airline. €250 / €400 / €600 by great-circle distance; €400 cap within the territory over 1,500 km; 50% reduction possible for flights over 3,500 km delayed 3 to 4 hours. Cancellations with 14+ days' notice are not compensated; short-notice cancellations with rerouting go to review. Weather, security, ATC and external strikes are flagged as likely extraordinary circumstances (review). The 2026 reform keeps these numbers and is expected to apply from the second half of 2027.
- **UK261**: same structure in GBP (£220 / £350 / £520), UK departures, or UK arrivals on UK or EU airlines.
- **US DOT**: no cash compensation for delays; refund when cancelled or 3h+ (domestic) / 6h+ (international) late and the passenger did not travel; involuntary denied boarding at 200% / 400% of the fare up to DOT caps (verify current caps).
- **Montreal Convention (baggage)**: written damage complaint within 7 days of receipt, delay claim within 21 days of delivery, bag deemed lost after 21 days, 2-year limitation, liability limit 1,519 SDR (verify; set the SDR rate in Settings).

Run the tests:

```bash
npm test          # eligibility, provider parsing, replay, evidence priority
npm run typecheck
npm run lint
```

## Deploying

The app is a standard Next.js 16 server (`output: "standalone"`). Photos live in MongoDB (GridFS), so it runs on any host.

### Fly.io (recommended: no upload size limit, in-process cron)

```bash
fly launch --no-deploy            # uses the included Dockerfile
fly secrets set MONGODB_URI=... AUTH_SECRET=... AUTH_URL=https://<app>.fly.dev \
  AERODATABOX_RAPIDAPI_KEY=... INTERNAL_CRON=true
fly deploy
```

### Vercel

1. Import the repo, add the environment variables.
2. Background tracking: Vercel Hobby cron runs at most daily, so use an external scheduler that calls `GET https://<app>/api/cron/poll` every 5 minutes with header `Authorization: Bearer <CRON_SECRET>` (cron-job.org or a GitHub Actions schedule work). On Pro, `vercel.json` already declares a 5-minute cron.
3. Vercel limits request bodies to about 4.5 MB. Set `MAX_UPLOAD_MB=4` and `NEXT_PUBLIC_MAX_UPLOAD_MB=4`, or deploy on Fly.io for full-size photos.

### MongoDB Atlas

Create a free cluster, a database user, and allow network access from your host (for a hackathon, `0.0.0.0/0`). Indexes are created automatically on first use.

## Flight Ripple

Open any trip and choose the **Ripple** tab. Code lives in `lib/ripple/` (pure, unit tested) with the server pieces in `service.ts`, `model.ts` and `aircraft-provider.ts`.

**Passenger Network** (`lib/ripple/reports.ts`). People following the same dated flight (flight number, local date and origin, e.g. `BA117:2026-10-10:LHR`) can submit one of twelve structured observations ("boarding started", "delay announced: 45 min", "no aircraft at the gate"...). Only people who added that flight to their own trips can read or post its reports. Reports are stored with a pseudonymous contributor id (an HMAC of user and flight, different on every flight); others only ever see aggregates such as "2 people, 4 min ago". Notes are private to their author and have contact details and booking-like codes removed.

Aggregation is deterministic. For each kind of observation:

```
support  = sum over distinct contributors of recency_weight x source_quality   (latest report per person)
conflict = support of observations that can't be true at the same time (passenger, schedule or ADS-B)
signal   = (1 - e^(-support)) x support / (support + conflict)
recency_weight = 0.5 ^ (age / half_life)   (half-life 15 to 240 min by type)
source_quality = provider 1.0, aircraft 0.9, passenger 0.6 x eligibility x moderation
```

Labels are "Unverified" (one person), "Some" or "Strong corroboration", "Contested" and "Old report". The score is never shown as a probability, and a single report never changes the forecast. Server-side protections: strict schema (unknown types and extra fields rejected), time-window and value checks, 10-minute duplicate protection, rate limits per person (30 per hour), per person per flight (6 per 10 minutes) and per flight (300 per 10 minutes), burst flagging, and lower weight for reports that don't fit the flight's phase or come from brand-new accounts. Users can turn sharing off (their past reports are withdrawn from every aggregate) and delete their reports in Settings; account export and deletion include them.

**Aircraft Network** (`lib/ripple/rotation.ts`, `propagation.ts`). When the schedule provider assigns an aircraft registration to your flight, ClaimWing fetches that aircraft's legs for the day (AeroDataBox `/flights/reg/{reg}/{date}`, cached and shared). Flights are linked only when the same registration flies both, the earlier leg lands where the next departs, and the scheduled gap is 15 minutes to 12 hours. Flight numbers and mirror-image routes never create a link, and if your flight isn't in the aircraft's list (a likely swap) the rotation is shown as unknown. Assignment changes are kept on the trip so swaps are detected.

```
predicted_inbound_arrival = scheduled_inbound_arrival + predicted_arrival_delay
remaining_turnaround      = target_scheduled_departure - predicted_inbound_arrival
knock_on_delay            = max(0, needed_turnaround - remaining_turnaround)
```

"Needed turnaround" is a range by aircraft size and airline type (or measured from historical rotations when the model artifact includes them), and every estimate carries a low/mid/high band through each later leg. AviationStack can't list an aircraft's legs, and ADS-B gives positions only, so with those providers the rotation is reported as unavailable rather than guessed.

**Prediction engine** (`lib/ripple/engine.ts`). Combines recorded times, provider estimates, the incoming aircraft, corroborated reports, weather and the model into one typed result: risk per threshold (15, 60, 180 min), expected delay range, downstream forecasts with a step-by-step chain, factors with sources and timestamps, data quality (missing, stale, conflicting) and the model card. Results are shared by everyone following the flight, cached for 60 seconds, invalidated by new reports or aircraft changes, and stored as versioned records whenever they change, which powers "What changed?" and the forecast history slider. Forecasts are never passed to the eligibility engine; claims use recorded arrival times only.

### The model

`ml/` trains LightGBM models and exports them as JSON trees that `lib/ripple/gbdt.ts` evaluates in the Next.js server (no Python in production). See [`ml/README.md`](ml/README.md) for data sources, method and full results. The shipped artifact was trained on BTS on-time data for all 2013 departures from JFK, LGA and EWR (nycflights13, 336,776 flights), so the app uses it only for those airports and airlines and shows a rule-based estimate elsewhere. Honest summary of the held-out test period (Nov to Dec 2013): en-route forecasts are strong (AUC 0.90 to 0.98); pre-departure forecasts beat the historical baseline only slightly; the en-route 180-minute model didn't beat its baseline, so its probability is withheld. Model B (propagation) needs full BTS data with both directions of each rotation and is skipped in the shipped artifact.

```bash
npm run ml:test                                    # pipeline tests (synthetic data)
NYC_DATA=/path/to/nycflights13/data npm run ml:train   # retrain and re-evaluate
```

### Database changes

All additions are backwards compatible: new collections `flightreports` and `ripplepredictions` (30-day TTL), optional `aircraft` on trips, `communityReports` and `guidance` on users, and a `comparison` marker source. No data migration is needed. Indexes are created on startup; for a large production database run `npm run db:indexes` before deploying.

## Guidance and help

New accounts get a skippable welcome tour (`/app/welcome`) that adds or picks a flight and shows its first status and forecast; completion is stored on the account and the tour never reappears. Every page has contextual help (the ? button or the `?` key), aviation and legal terms have tap-to-explain definitions, and `Ctrl K` / `Cmd K` opens a search for pages, trips and actions. Guided flows: track a flight, "Explain this to me" on the Ripple tab, the step guide on each bag, and the claim readiness checklist.

## Tests

```bash
npm test               # vitest: eligibility, providers, Flight Ripple, vision (all offline)
npm run ml:test        # Python pipeline tests
npm run check:text     # fails if any maintained text file contains an em dash
BASE_URL=http://localhost:3000 npm run test:e2e   # end-to-end against a running server and a development database
```

## Recording a replay

The included replay (`data/replays/sample-ba117-lhr-jfk.json`) is **synthetic**. To record a real flight from airplanes.live:

```bash
npm run replay:record -- --callsign BAW117 --flight BA117 --from LHR --to JFK \
  --scheduled-departure 2026-10-10T09:20:00Z --scheduled-arrival 2026-10-10T17:20:00Z \
  --out data/replays/ba117-2026-10-10.json
```

Run it from before pushback until the aircraft is at the gate, then set `DEMO_REPLAY` in `lib/trips.ts` to the new file name. Edit `gateArrivalMin` if you know the real gate arrival time.

## Demo script (about 3 minutes)

Fastest path for judges: open `/demo` (no account), keep **Flight Ripple cascade** selected, press **Jump to the key moment**, then **Play** or step with the arrow keys. **Reset** returns to an identical starting state.

With an account:

1. Sign in as the seeded demo user. The dashboard shows the demo trip and its bag.
2. Open **BA117**, Flight tab. The replay shows the aircraft taxiing out more than 3 hours late; the delay alert and "what you're owed now" checklist appear. (Use **Restart** on the demo banner to replay from the start.)
3. Watch it cross the Atlantic and land. The delay is measured with its source (gate arrival) and the eligibility updates: UK261, £520 (reducible to £260 because the flight is over 3,500 km and under 4 hours late).
4. Open the bag: **Compare** shows before and after with a slider; the cracked shell is marked. The bag tag photo is blurred on export.
5. **Claim** tab, start a combined claim, review the letter (placeholders highlighted), save, and **Download evidence PDF**.

For a live flight: add a trip for any flight currently in the air (use "Find flight details automatically" with an AeroDataBox key), open the Flight tab, and watch the real position update every 20 seconds.

## Project layout

```
app/                 routes (pages and /api route handlers); /demo is the public Demo Center
components/          ui, shell, trips, flight, ripple, demo, onboarding, help, baggage, claim, settings
lib/                 db, auth, rules, providers, storage, pdf, letter, tracker, validation
lib/ripple/          Flight Ripple: reports, rotation, propagation, model, engine, service, sim (Demo Center)
lib/vision/          in-browser before/after photo comparison
ml/                  model training pipeline (Python) and its tests
models/              Mongoose models (explicit interfaces)
data/                airports.json, airlines.json (open data), replays/
scripts/             seed, reference data build, replay record/generate
tests/               vitest unit tests; tests/e2e end-to-end script
data/models/         trained Flight Ripple model and its evaluation report
```

Reference data: airports from OurAirports (public domain) with time zones from OpenFlights (ODbL); rebuild with `npm run data:build`.

## Known limitations

- Single-segment trips. For connecting flights under EU261, the distance and delay are measured to the final destination; enter the whole journey's origin and final destination with the final scheduled arrival, or use **Needs review**.
- Airline country comes from OpenFlights data and can be out of date. For codeshares, set **Who operated the flight?** in the trip's Advanced section.
- Password reset by email is not implemented (no email provider configured). Users can sign in with Google instead.
- Privacy and terms pages are drafts that describe how the software works; they must be reviewed before public launch.
- Flight data sources used by default are licensed for non-commercial use.
- The shipped delay model covers 2013 New York departures only; retrain on recent full BTS data for production use. Rotation tracking needs an AeroDataBox key.
- Passenger reports require an account and a trip for that flight; anonymous reporting isn't supported.
