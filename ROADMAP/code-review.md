# PTV GTFS-R Proxy — Code Review

## General / Project Health
- Add a `README.md` at the project root — currently none exists, making it hard for new developers to onboard
- Lock Node.js engine version in `package.json` (`"engines": { "node": ">=18.x" }`) to avoid runtime incompatibilities
- Add `.nvmrc` or `.node-version` file to standardise Node version across environments
- Move `package-lock.json` into `.gitattributes` with `linguist-generated` to reduce noise in PR diffs

## Backend (`server.js`)
- Extract feed configuration and route handlers into separate modules (e.g. `routes/gtfs.js`, `config/feeds.js`) instead of a single monolithic file
- Add request logging middleware (e.g. `morgan`) for debugging and observability
- Add rate-limiting middleware (`express-rate-limit`) to prevent abuse of the proxy endpoint
- Replace the ad-hoc `fetchBuffer` Promise with `node:https` — or switch to `node-fetch`/`undici` for cleaner async code
- Add proper error classification (network error vs auth error vs upstream 5xx) so the frontend can show distinct messages
- Make the cache TTL configurable via environment variable instead of hardcoded 30000ms
- Add a `/health` endpoint for uptime monitoring and load-balancer health checks
- Add environment variable validation at startup (fail fast if `PTV_API_KEY` is missing)
- Graceful shutdown handler (`SIGTERM`/`SIGINT`) to close the server cleanly

## Frontend (`script.js`)
- Extract UI components into separate files (e.g. `components/map.js`, `components/dashboard.js`, `utils/format.js`) — the single 546-line file is becoming hard to maintain
- Replace raw DOM manipulation with a small reactive pattern or vanilla web components for better state management
- Debounce the route search input handler to avoid excessive re-renders during fast typing
- Handle network errors more gracefully — show a retry button with exponential backoff instead of a static error message
- Add a loading skeleton / shimmer for stat cards while data is fetched
- Move Leaflet tile URL and map defaults into a config object instead of hardcoding in `initMap()`
- Add keyboard navigation support for the sidebar (arrow keys, Enter/Space to activate)
- Add ARIA labels to interactive elements (nav buttons, feed selector, theme toggle) for accessibility

## CSS / Design (`style.css`)
- Extract CSS custom properties into a dedicated `tokens.css` file for better organisation
- Add `prefers-reduced-motion` media query to disable toast slide animations for users with vestibular disorders
- Add `prefers-color-scheme` support so the initial theme respects the OS setting before JS loads
- Use a CSS reset or `normalize.css` to smooth cross-browser rendering differences
- Add print stylesheet to hide sidebar when printing dashboard data

## Security
- Add CORS configuration (even if same-origin, explicit is better than implicit) — currently relies on default Express behaviour
- Set security HTTP headers via `helmet` middleware (X-Content-Type-Options, X-Frame-Options, CSP, etc.)
- Sanitise and validate the `limit` query parameter as a positive integer (currently only capped at 200, but passing `NaN` or negative values could cause unexpected behaviour)
- Add input size limits to prevent extremely large responses from consuming all server memory
- Consider adding a CSRF token for any future mutation endpoints
- Switch Let's Encrypt to DNS-01 challenge — no port 80 forwarding needed on home router (see `ROADMAP/home-deployment-security.md`)

## Deployment / Infrastructure
- Add a `Dockerfile` and `docker-compose.yml` for containerised deployment (simplifies the Raspberry Pi setup)
- The Python deployment scripts could be converted to Ansible playbooks for idempotent provisioning
- Add a CI/CD pipeline stub (GitHub Actions) for linting on PR and auto-deploy on merge to main
- Consider using PM2 or `systemd` watchdog to auto-restart the Node process if it crashes
- Add Prometheus metrics endpoint (`/metrics`) for monitoring cache hit rates, request latency, and upstream API errors

## Monitoring / Observability
- Add structured logging (e.g. `pino` or `winston`) instead of `console.log` — pipe to a file or journald on the Pi
- Add client-side performance instrumentation (time-to-data, map render time)
