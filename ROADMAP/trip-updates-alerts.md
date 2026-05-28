# Trip Updates + Service Alerts — Sprint Plan

Add remaining PTV realtime feed types (trip updates, service alerts) as proxy endpoints and frontend display panels.

## PTV API Endpoints

| Feed Key | Upstream URL |
|---|---|
| `metro-vehicle-positions` | `…/v1/metro/vehicle-positions` ✅ existing |
| `metro-trip-updates` | `…/v1/metro/trip-updates` |
| `metro-service-alerts` | `…/v1/metro/service-alerts` |
| `bus-vehicle-positions` | `…/v1/bus/vehicle-positions` ✅ existing |
| `bus-trip-updates` | `…/v1/bus/trip-updates` |
| `bus-service-alerts` | `…/v1/bus/service-alerts` (confirm endpoint exists) |

---

## Phase 1 — Backend: Feed configs

- [x] Add 4 new feed URLs to `config/feeds.js` (metro-trip-updates, metro-service-alerts, bus-trip-updates, bus-service-alerts)
- [x] Update `test/feeds.test.js`: change "has all 2 feed keys" → "has all 6 feed keys", add new keys to `VALID_KEYS` array
- [x] Verify no changes needed in `routes/gtfs.js` (validation, cache, metrics all use feed key generically)

## Phase 2 — Backend: Mock data

- [x] Add service-alert mock entities to `buildMockData()` in `src/components/dashboard.js`
  - Structure: `{ id, alert: { informedEntity: [{ routeId }], headerText, description, cause, effect, activePeriod } }`
- [x] Mock data generation already handles trip-update entities for `*-trip-updates` feed keys via the existing catch-all path

## Phase 3 — Frontend: Feed selection

- [x] Add 4 new `<option>` elements to the feed `<select>` in `index.html`
- [x] `getEntityRouteIds()` already handles `vehicle`, `tripUpdate`, `alert` entity types — no changes needed
- [x] `filterEntitiesByRoute()` delegates to `getEntityRouteIds()` — no changes needed
- [x] `updateRouteSearchUI()` uses `feed.startsWith("bus-")` — works for all 6 feed keys without changes

## Phase 4 — Frontend: Trip updates display

- [x] Add a third stat card column (or swap) for trip-updates feed: show "Avg delay"
- [x] Render trip-update entities in the dashboard: table with route, trip, stop, scheduled time, delay
- [x] Show delay with color coding (green = on time, yellow = minor delay, red = major delay)
- [x] Replace raw JSON preview with structured HTML table for trip-update feeds

## Phase 5 — Frontend: Service alerts display

- [x] Add dedicated **Alerts** panel/tab (separate from Dashboard + Preview) as a new nav section
- [x] Render alerts as a list of cards: header text, description, affected routes, cause/effect, time window
- [x] Add alert severity/type badges (e.g. "Delayed", "Cancelled", "Platform change")
- [x] Add alert badge/counter to the sidebar nav button

## Phase 6 — Frontend: Map integration

- [ ] For trip-updates feed: show affected stops as markers on the map with delay indicators
- [ ] For service-alerts feed: show alert polygons/overlays or banners on the map (deferred if complex)

## Phase 7 — Polish & docs

- [ ] Update `.env.example` if any new env vars are needed (none expected)
- [ ] Update `README.md`: Features list, Feed Keys table (now 6 feeds)
- [ ] Update `ROADMAP/frontend-sprint.md` and `ROADMAP/backend-sprint.md` if applicable
- [ ] Run `npm test` — update test count in README if tests added
- [ ] Run `npm run lint` — verify 0 errors

## Future (out of scope)

- Real-time push (SSE) for instant trip-update arrival notifications
- Historical trip delay tracking per stop/route
- GTFS static data integration (stop names, route colours, scheduled times)
