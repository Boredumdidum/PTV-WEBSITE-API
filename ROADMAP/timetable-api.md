# PTV Timetable API v3 — Sprint Plan

Add the PTV Timetable API v3 (`timetableapi.ptv.vic.gov.au`) alongside the existing GTFS-RT proxy. Uses HMAC-SHA1 signature auth with `SWAGGER_API_KEY` + `SWAGGER_DEV_ID`.

## Auth

The Timetable API requires a `devid` and `signature` query parameter on every request:

1. Take the full URL path + sorted query string (excluding `signature`)
2. Compute HMAC-SHA1 using `SWAGGER_API_KEY` as the key
3. Append as hex `signature` query param
4. Also append `devid` query param

## Key Endpoints

| Endpoint | Description |
|---|---|
| `/v3/departures/route_type/{rt}/stop/{sid}` | Departures from a stop |
| `/v3/departures/route_type/{rt}/stop/{sid}/route/{rid}` | Departures filtered by route |
| `/v3/routes` | All routes (filterable by route_types) |
| `/v3/routes/{route_id}` | Single route |
| `/v3/stops/location/{lat},{lng}` | Stops near a location |
| `/v3/stops/route/{rid}/route_type/{rt}` | Stops on a route |
| `/v3/search/{term}` | Search routes/stops |
| `/v3/disruptions` | All active disruptions |
| `/v3/disruptions/route/{rid}` | Disruptions for a route |
| `/v3/route_types` | Transport modes |
| `/v3/runs/route/{rid}` | Scheduled runs for a route |
| `/v3/pattern/run/{ref}/route_type/{rt}` | Stop pattern for a run |
| `/v3/directions/route/{rid}` | Travel directions for a route |
| `/v3/outlets` | myki ticket outlets |
| `/v3/fare_estimate/min_zone/{min}/max_zone/{max}` | Fare estimate |

## Phase 1 — Backend: Auth + Proxy ✓

- [x] Create `utils/hmac.js` — HMAC-SHA1 signature computation
- [x] Create `routes/timetable.js` — generic proxy route `/api/timetable/*` that forwards to `timetableapi.ptv.vic.gov.au` with `devid` + `signature` appended
- [x] Add env var validation in `server.js` for `SWAGGER_API_KEY` and `SWAGGER_DEV_ID`
- [x] Add error handling for timetable API errors (401 = bad key/devid, etc.)
- [x] Add cache middleware to timetable proxy (uses shared `middleware/cache.js`)

## Phase 2 — Frontend: Departures Board ✓

- [x] Add "Departures" tab in sidebar
- [x] Add stop search input (search by name via `/v3/search`)
- [x] Display departures from selected stop as a table: route, direction, scheduled time, estimated time, platform

## Phase 3 — Frontend: Disruptions ✓

- [x] Add "Disruptions" tab (separate from GTFS-RT alerts)
- [x] Fetch from `/v3/disruptions` and display as cards
- [x] Filter by route type (Train, Bus)

## Phase 4 — Frontend: Routes Browser ✓

- [x] Add "Routes" tab 
- [x] List all route types (train, bus)
- [x] Click to expand to show routes for a type

## Phase 5 — Polish & Docs ✓

- [x] Update `.env.example` (already had `SWAGGER_API_KEY` and `SWAGGER_DEV_ID`)
- [x] Update `Dockerfile` to include `COPY utils ./utils`
- [x] Update `scripts/setup_pi.py` to create new env vars in `.env`
- [x] Update `package.json` description

## Future (out of scope for this sprint)

- Stop map markers with departure info popups
- myki outlet locator
- Fare estimator
- GTFS-RT API phase-out / replacement
