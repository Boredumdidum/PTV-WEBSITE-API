# Urgent Fixes — Prioritised by Difficulty (1 = hardest)

## 1. Make alert route names look like disruptions

Currently alerts strip route info entirely (per user request). But route names in the alerts panel should use the same display format as disruptions — deduplicated, full route names (e.g. "Werribee", "Craigieburn") sourced from the Timetable API route cache, matching the style in the disruptions tab. Also evaluate if alerts and disruptions overlap in functionality (both show service impact info from different sources — GTFS-RT alerts vs Timetable API disruptions).

**Difficulty: 2**

---

## 2. Better timetable departures layout

The departures table has too many empty columns (e.g. estimated time when it matches scheduled, platform for buses). Need to:
- Hide columns when data is consistently absent (platform for non-train modes)
- Merge scheduled/estimated when identical
- Consider a more compact card-based layout instead of a wide table
- Use `max_results` from the stop search to avoid showing 25 empty rows

**Difficulty: 3**

---

## 3. Line search improvement

Dashboard route search (`#route-search`) has a bug: searching "Lil" works (shows Lilydale results), but searching the full name "Lilydale" returns blank. Likely a matching logic issue in `filterEntitiesByRoute` or `resolveSelectedRouteId` where the route ID format doesn't match the query string (e.g. raw GTFS route ID `"Lilydale"` vs a formatted/cached version).

**Difficulty: 4 (easiest)**
