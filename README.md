# PTV GTFS-RT Proxy

A local proxy dashboard for Victoria's Public Transport GTFS Realtime feeds. Fetches protobuf transit data from the [Department of Transport and Planning API](https://www.ptv.vic.gov.au/footer/data-and-reporting/ptv-api/), decodes it to JSON, and displays it in a neo-brutalist web dashboard.

## Features

- **5 realtime feeds** — metro trip updates, service alerts, vehicle positions; bus trip updates and vehicle positions
- **Proxy architecture** — API key stays server-side, browser only talks to the local proxy
- **30-second cache** — reduces upstream API calls; TTL configurable via `CACHE_TTL_MS` env var
- **Leaflet map** — vehicle positions plotted on an OpenStreetMap base layer
- **Route search** — filter entities by route ID in real time
- **Mock data mode** — offline testing with generated data
- **Dark/light theme** — persisted to `localStorage`
- **Neo-brutalist UI** — bold, sharp, no rounded corners
- **Structured logging** — JSON logs via Pino with per-request correlation IDs
- **Rate limited** — 60 requests/minute per IP to the GTFS endpoint
- **Security headers** — Helmet middleware sets 7 security-related HTTP headers
- **Health endpoint** — `/health` returns cache status, uptime, upstream reachability
- **Error classification** — auth failures, upstream 5xx, and network errors return distinct HTTP status codes

## Stack

| Layer | |
|---|---|
| Backend | Node.js, Express 4.19, Helmet, Pino, express-rate-limit |
| Frontend | Vanilla HTML, CSS, JavaScript |
| Map | Leaflet 1.9.4 (CDN) + OpenStreetMap tiles |
| Icons | Lucide (CDN) |
| Data | GTFS Realtime (Protocol Buffers) |
| TLS | nginx reverse proxy (self-signed or Let's Encrypt) |

## Quick Start

```bash
npm install
echo "PTV_API_KEY=your-key-here" > .env
npm start
```

Open `http://localhost:3000` in your browser.

## Raspberry Pi Deployment

See [docs/raspberry-pi-setup.md](docs/raspberry-pi-setup.md) for full deployment instructions on a Pi with DuckDNS, nginx, and TLS.

## Project Structure

```
├── server.js          # Express backend — middleware, routes, static files
├── index.html         # Single-page app
├── script.js          # Frontend logic (546 lines)
├── style.css          # Neo-brutalist stylesheet (515 lines)
├── config/            # Feed configuration and validation
│   └── feeds.js
├── middleware/         # Express middleware
│   └── cache.js       # In-memory TTL cache (get/set/getStatus)
├── routes/            # Route handlers
│   └── gtfs.js        # GTFS-RT feed proxy — fetch, decode, cache, error classify
├── data/              # OpenAPI specs for upstream PTV endpoints
├── scripts/           # Python deployment scripts (Pi setup, certs)
├── fonts/             # Custom display fonts
├── ROADMAP/           # Code review, sprint plans, security doc
└── docs/              # Deployment guide and UI style guide
```

## API

| Endpoint | Description |
|---|---|
| `GET /api/gtfs?feed=<key>&limit=<n>` | Fetch and decode a GTFS-RT feed |
| `GET /` | Dashboard UI (static files) |

### Feed Keys

- `metro-trip-updates`
- `metro-service-alerts`
- `metro-vehicle-positions`
- `bus-trip-updates`
- `bus-vehicle-positions`

## License

Apache 2.0 — see [LICENSE](LICENSE).

## Roadmap

See the [ROADMAP](ROADMAP) folder for:
- [Code review & suggestions](ROADMAP/code-review.md)
- [Front-end sprint plan](ROADMAP/frontend-sprint.md)
- [Back-end sprint plan](ROADMAP/backend-sprint.md)
- [Home deployment security guide](ROADMAP/home-deployment-security.md)
