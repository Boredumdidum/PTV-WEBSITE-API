# PTV Transit Dashboard

A local proxy dashboard for Victoria's Public Transport — combines GTFS Realtime feeds (protobuf) with the PTV Timetable API v3 (REST). Dispatches real-time vehicle positions, trip updates, service alerts, scheduled departures, route maps, and disruptions in a neo-brutalist web dashboard.

## Features

### GTFS Realtime (4 feeds)
- **Vehicle positions** — metro trains and buses plotted on a Leaflet map
- **Trip updates** — per-trip delay summary with color-coded badges
- **Service alerts** — alert cards with severity, cause, routes, and active period
- **Route search** — filter entities by route ID in real time with debounced input

### Timetable API v3 (3 tabs)
- **Departures board** — search stops by name, view scheduled + estimated departure times with cancellation status
- **Route browser** — expandable panels by transport mode (Train, Tram, Bus, V/Line, Night Bus)
- **Disruptions** — current and planned disruptions filterable by route type

### Platform
- **Proxy architecture** — API keys stay server-side, browser only talks to the local proxy
- **30-second cache** — reduces upstream API calls; TTL configurable, max 100 entries
- **Retry with backoff** — up to 2 retries on GTFS upstream 5xx/network errors (1s, 2s delays)
- **Request timeout** — upstream fetches time out after 15 seconds
- **Compressed responses** — all JSON, CSS, JS, HTML gzip-compressed
- **Leaflet map** — vehicle positions plotted on an OpenStreetMap base layer, locked to Victoria bounds
- **Loading skeleton** — shimmer animation on stat cards and preview during data fetch
- **Mock data mode** — offline testing with generated data
- **Dark/light theme** — persisted to `localStorage`, respects OS preference on first visit
- **Collapsible sidebar** — toggle with hamburger button, state saved to `localStorage`
- **Keyboard navigation** — arrow keys cycle sidebar tabs, ARIA roles and labels
- **Accessibility** — `prefers-reduced-motion` disables animations, semantic HTML, `aria-live` regions
- **Structured logging** — JSON logs via Pino with per-request correlation IDs
- **Rate limited** — GTFS endpoint 60 req/min, Timetable endpoint 120 req/min
- **Security headers** — Helmet middleware with custom CSP allowing CDN scripts, maps, and fonts
- **Request size limits** — 1KB JSON body limit, 2MB upstream response cap
- **Graceful shutdown** — SIGTERM/SIGINT handler with 10s drain timeout
- **Express error middleware** — catch-all handler prevents unhandled route crashes
- **Health endpoint** — `/health` returns cache status, uptime, credential readiness
- **Error classification** — auth failures, upstream 5xx, and network errors return distinct HTTP status codes
- **Prometheus metrics** — request duration, cache hit/miss, upstream latency at `/metrics` (IP-allowlisted)
- **Browser tests** — Playwright smoke tests for UI, map, theme, and tab navigation
- **Linted + formatted** — ESLint with recommended rules, Prettier with project-specific overrides

## Stack

| Layer       |                                                                 |
| ----------- | --------------------------------------------------------------- |
| Backend     | Node.js, Express 4.19, Helmet, Pino, express-rate-limit         |
| Frontend    | Vanilla HTML, CSS, JavaScript (ES modules)                      |
| Map         | Leaflet 1.9.4 (CDN) + OpenStreetMap tiles                       |
| Icons       | Lucide (CDN)                                                    |
| Data        | GTFS Realtime (Protocol Buffers) + PTV Timetable API v3 (REST)  |
| Auth (RT)   | Ocp-Apim-Subscription-Key header (`PTV_API_KEY`)                |
| Auth (TT)   | HMAC-SHA1 signature + devid (`SWAGGER_API_KEY` + `SWAGGER_DEV_ID`) |
| TLS         | nginx reverse proxy (self-signed or Let's Encrypt)              |
| Container   | Docker (multi-stage Node 20 Alpine), Docker Compose             |
| Code quality| ESLint 8 + Prettier 3                                           |

## Quick Start

### With Node

```bash
npm install
echo -e "PTV_API_KEY=your-key-here\nSWAGGER_API_KEY=your-hmac-key\nSWAGGER_DEV_ID=your-devid" > .env
chmod 600 .env
npm start
```

### With Docker

```bash
echo -e "PTV_API_KEY=your-key-here\nSWAGGER_API_KEY=your-hmac-key\nSWAGGER_DEV_ID=your-devid" > .env
chmod 600 .env
docker compose up -d --build
```

## Testing

```bash
npm test                 # unit + integration tests with coverage (node:test --experimental-test-coverage)
npm run test:e2e         # Playwright browser smoke tests (requires npm install + npx playwright install)
npm run lint             # ESLint check
npm run format:check     # Prettier check
```

## Configuration

| Variable             | Default    | Description                                                                 |
| -------------------- | ---------- | --------------------------------------------------------------------------- |
| `PTV_API_KEY`        | _required_ | PTV Open Data API subscription key (GTFS-RT)                               |
| `SWAGGER_API_KEY`    | _required_ | PTV Timetable API v3 HMAC-SHA1 secret key                                  |
| `SWAGGER_DEV_ID`     | _required_ | PTV Timetable API v3 developer ID                                          |
| `PORT`               | `3000`     | Port the Express server listens on                                         |
| `CACHE_TTL_MS`       | `30000`    | Feed cache TTL in milliseconds                                             |
| `REQUEST_TIMEOUT_MS` | `15000`    | Upstream fetch timeout in milliseconds                                     |
| `LOG_LEVEL`          | `info`     | Pino log level (`fatal`, `error`, `warn`, `info`, `debug`, `trace`)        |

## Raspberry Pi Deployment

See [docs/raspberry-pi-setup.md](docs/raspberry-pi-setup.md) for full deployment instructions on a Pi with DuckDNS, nginx, and TLS. Docker is the recommended deployment method on Pi.

## Project Structure

```
├── server.js          # Express backend — middleware, routes, static files
├── theme-init.js      # Early theme init (runs before CSS loads)
├── Dockerfile         # Multi-stage Node 20 Alpine container
├── docker-compose.yml # Service definition with env file and healthcheck
├── .dockerignore      # Build context exclusions
├── .eslintrc.json     # ESLint config (recommended rules + overrides)
├── .prettierrc        # Prettier config (tabs frontend, 2-space backend)
├── .env.example       # Documented environment variables template
├── index.html         # Single-page app with ARIA roles
├── favicon.svg        # SVG favicon — map pin with position dot
├── script.js          # Entry point — imports from src/ modules
├── style.css          # Neo-brutalist stylesheet
├── src/               # Frontend ES modules
│   ├── constants.js   # Map defaults, feed colors, train route codes
│   ├── utils/
│   │   ├── format.js  # Formatting: timestamps, speed, route names
│   │   └── dom.js     # DOM helpers: status, map hints, theme, toasts
│   └── components/
│       ├── map.js     # Leaflet map logic, markers, route lines
│       ├── dashboard.js # GTFS-RT data fetching, mock data, navigation
│       └── timetable.js # Timetable API: departures, route browser, disruptions
├── utils/
│   └── hmac.js        # HMAC-SHA1 signature utility for Timetable API auth
├── config/
│   └── feeds.js       # GTFS-RT feed URLs and validation
├── middleware/
│   ├── cache.js       # In-memory TTL cache (get/set/getStatus)
│   └── metrics.js     # Prometheus metrics (histograms, counters)
├── routes/
│   ├── gtfs.js        # GTFS-RT feed proxy — fetch, decode, cache, error classify
│   └── timetable.js   # Timetable API proxy — HMAC sign, forward, cache
├── scripts/           # Python deployment scripts (Pi setup, certs, certbot hook)
├── test/              # Unit tests (node:test)
├── tests/e2e/         # Browser smoke tests (Playwright)
├── data/              # GeoJSON line data + OpenAPI specs
├── fonts/             # Custom display fonts
├── ROADMAP/           # Code review, sprint plans, security doc
└── docs/              # Deployment guide and UI style guide
```

## API

| Endpoint                                       | Description                                                                        |
| ---------------------------------------------- | ---------------------------------------------------------------------------------- |
| `GET /api/gtfs?feed=<key>&limit=<n>`           | Fetch and decode a GTFS-RT feed (rate-limited, 60 req/min)                         |
| `GET /api/timetable/v3/<path>?<query>`         | Proxy to PTV Timetable API v3 with HMAC-SHA1 auth (rate-limited, 120 req/min)      |
| `GET /health`                                  | Health check — cache status, uptime, credential readiness                          |
| `GET /metrics`                                 | Prometheus metrics — request duration, cache hit/miss, upstream latency            |
| `GET /`                                        | Dashboard UI (static files)                                                        |

### GTFS-RT Feed Keys

- `metro-vehicle-positions` — Metro train GPS positions
- `metro-trip-updates` — Metro train trip delay data
- `metro-service-alerts` — Metro train service alerts
- `bus-vehicle-positions` — Bus GPS positions
- `bus-trip-updates` — Bus trip delay data

### Timetable API v3 (partial list)

| Endpoint (appended to `/api/timetable/v3/`)          | Description                         |
| ---------------------------------------------------- | ----------------------------------- |
| `departures/route_type/{rt}/stop/{sid}`              | Departures from a stop              |
| `departures/route_type/{rt}/stop/{sid}/route/{rid}`  | Departures filtered by route        |
| `routes?route_types={types}`                         | All routes (filterable by mode)     |
| `search/{term}`                                      | Search routes and stops by name     |
| `disruptions?route_types={types}`                    | Current and planned disruptions     |
| `route_types`                                        | List transport modes                |
| `stops/route/{rid}/route_type/{rt}`                  | Stops on a route                    |
| `runs/route/{rid}`                                   | Scheduled runs for a route          |
| `directions/route/{rid}`                             | Travel directions for a route       |

## License

Apache 2.0 — see [LICENSE](LICENSE).

## Roadmap

See the [ROADMAP](ROADMAP) folder for:

- [Code review & suggestions](ROADMAP/code-review.md)
- [Front-end sprint plan](ROADMAP/frontend-sprint.md)
- [Back-end sprint plan](ROADMAP/backend-sprint.md)
- [Home deployment security guide](ROADMAP/home-deployment-security.md)
