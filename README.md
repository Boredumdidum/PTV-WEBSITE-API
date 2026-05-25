# PTV GTFS-RT Proxy

A local proxy dashboard for Victoria's Public Transport GTFS Realtime feeds. Fetches protobuf transit data from the [Department of Transport and Planning API](https://www.ptv.vic.gov.au/footer/data-and-reporting/ptv-api/), decodes it to JSON, and displays it in a neo-brutalist web dashboard.

## Features

- **5 realtime feeds** — metro trip updates, service alerts, vehicle positions; bus trip updates and vehicle positions
- **Proxy architecture** — API key stays server-side, browser only talks to the local proxy
- **30-second cache** — reduces upstream API calls
- **Leaflet map** — vehicle positions plotted on an OpenStreetMap base layer
- **Route search** — filter entities by route ID in real time
- **Mock data mode** — offline testing with generated data
- **Dark/light theme** — persisted to `localStorage`
- **Neo-brutalist UI** — bold, sharp, no rounded corners

## Stack

| Layer | |
|---|---|
| Backend | Node.js, Express 4.19 |
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
├── server.js          # Express backend — proxy endpoint + static files
├── index.html         # Single-page app
├── script.js          # Frontend logic (546 lines)
├── style.css          # Neo-brutalist stylesheet (515 lines)
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

Apache 2.0
