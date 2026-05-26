# PTV GTFS-RT Proxy

A local proxy dashboard for Victoria's Public Transport GTFS Realtime feeds. Fetches protobuf transit data from the [Department of Transport and Planning API](https://www.ptv.vic.gov.au/footer/data-and-reporting/ptv-api/), decodes it to JSON, and displays it in a neo-brutalist web dashboard.

## Features

- **2 realtime feeds** — metro and bus vehicle positions
- **Proxy architecture** — API key stays server-side, browser only talks to the local proxy
- **30-second cache** — reduces upstream API calls; TTL configurable via `CACHE_TTL_MS` env var
- **Leaflet map** — vehicle positions plotted on an OpenStreetMap base layer, locked to Victoria bounds with train route names
- **Route search** — filter entities by route ID in real time
- **Mock data mode** — offline testing with generated data
- **Dark/light theme** — persisted to `localStorage`
- **Collapsible sidebar** — toggle with hamburger button, state saved to `localStorage`
- **Neo-brutalist UI** — bold, sharp, no rounded corners
- **Structured logging** — JSON logs via Pino with per-request correlation IDs
- **Rate limited** — 60 requests/minute per IP to the GTFS endpoint
- **Security headers** — Helmet middleware with custom CSP allowing CDN scripts, maps, and fonts
- **Input validation** — `limit` query param validated as positive integer, max 200
- **Request size limits** — 1KB JSON body limit, 2MB upstream response cap
- **Graceful shutdown** — SIGTERM/SIGINT handler with 10s drain timeout
- **Health endpoint** — `/health` returns cache status, uptime, upstream reachability
- **Same-origin policy** — explicit `Cross-Origin-Resource-Policy: same-origin` via Helmet
- **Error classification** — auth failures, upstream 5xx, and network errors return distinct HTTP status codes
- **Request timeout** — upstream fetches time out after 15 seconds
- **Prometheus metrics** — request duration, cache hit/miss, upstream latency at `/metrics`
- **Browser tests** — Playwright smoke tests for UI, map, theme toggles, and feed selection

## Stack

| Layer | |
|---|---|
| Backend | Node.js, Express 4.19, Helmet, Pino, express-rate-limit |
| Frontend | Vanilla HTML, CSS, JavaScript |
| Map | Leaflet 1.9.4 (CDN) + OpenStreetMap tiles |
| Icons | Lucide (CDN) |
| Data | GTFS Realtime (Protocol Buffers) |
| TLS | nginx reverse proxy (self-signed or Let's Encrypt) |
| Container | Docker (multi-stage Node 20 Alpine), Docker Compose |

## Quick Start

### With Node
```bash
npm install
echo "PTV_API_KEY=your-key-here" > .env
chmod 600 .env
npm start
```

### With Docker
```bash
echo "PTV_API_KEY=your-key-here" > .env
chmod 600 .env
docker compose up -d --build
```

## Testing

```bash
npm test                 # 32 unit tests (node:test, zero dependencies)
npm run test:e2e         # Playwright browser smoke tests (requires npm install + npx playwright install)
```

## Configuration

| Variable | Default | Description |
|---|---|---|
| `PTV_API_KEY` | *required* | PTV Open Data API subscription key |
| `PORT` | `3000` | Port the Express server listens on |
| `CACHE_TTL_MS` | `30000` | Feed cache TTL in milliseconds |
| `LOG_LEVEL` | `info` | Pino log level (`fatal`, `error`, `warn`, `info`, `debug`, `trace`) |

## Raspberry Pi Deployment

See [docs/raspberry-pi-setup.md](docs/raspberry-pi-setup.md) for full deployment instructions on a Pi with DuckDNS, nginx, and TLS. Docker is the recommended deployment method on Pi.

## Project Structure

```
├── server.js          # Express backend — middleware, routes, static files
├── Dockerfile         # Multi-stage Node 20 Alpine container
├── docker-compose.yml # Service definition with env file and healthcheck
├── .dockerignore      # Build context exclusions
├── index.html         # Single-page app
├── favicon.svg        # SVG favicon — map pin with position dot
├── script.js          # Entry point — imports from src/ modules
├── src/               # Frontend modules
│   ├── constants.js   # Map defaults, feed colors, train route codes
│   ├── utils/
│   │   ├── format.js  # Formatting: timestamps, speed, route names
│   │   └── dom.js     # DOM helpers: status, map hints, theme, toasts
│   └── components/
│       ├── map.js     # Leaflet map logic, markers, route lines
│       └── dashboard.js # Data fetching, mock data, navigation
├── config/
│   └── feeds.js       # Feed URLs and validation
├── middleware/
│   ├── cache.js       # In-memory TTL cache (get/set/getStatus)
│   └── metrics.js     # Prometheus metrics (histograms, counters)
├── routes/
│   └── gtfs.js        # GTFS-RT feed proxy — fetch, decode, cache, error classify
├── scripts/           # Python deployment scripts (Pi setup, certs, certbot hook)
├── test/              # Unit tests (node:test)
├── tests/e2e/         # Browser smoke tests (Playwright)
├── data/              # GeoJSON line data + OpenAPI specs
├── fonts/             # Custom display fonts
├── ROADMAP/           # Code review, sprint plans, security doc
└── docs/              # Deployment guide and UI style guide
```

## API

| Endpoint | Description |
|---|---|
| `GET /api/gtfs?feed=<key>&limit=<n>` | Fetch and decode a GTFS-RT feed (rate-limited, 60 req/min) |
| `GET /health` | Health check — cache status, uptime, upstream reachability |
| `GET /metrics` | Prometheus metrics — request duration, cache hit/miss, upstream latency |
| `GET /` | Dashboard UI (static files) |

### Feed Keys

- `metro-vehicle-positions`
- `bus-vehicle-positions`

## License

Apache 2.0 — see [LICENSE](LICENSE).

## Roadmap

See the [ROADMAP](ROADMAP) folder for:
- [Code review & suggestions](ROADMAP/code-review.md)
- [Front-end sprint plan](ROADMAP/frontend-sprint.md)
- [Back-end sprint plan](ROADMAP/backend-sprint.md)
- [Home deployment security guide](ROADMAP/home-deployment-security.md)
