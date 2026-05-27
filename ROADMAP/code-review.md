# PTV GTFS-R Proxy — Code Review

## General / Project Health

- [x] Lock Node.js engine version in `package.json` (`"engines": { "node": ">=18.x" }`) to avoid runtime incompatibilities
- [x] Add `.nvmrc` or `.node-version` file to standardise Node version across environments
- [x] Move `package-lock.json` into `.gitattributes` with `linguist-generated` to reduce noise in PR diffs

## Backend (`server.js`)

- [x] Extract feed configuration and route handlers into separate modules (e.g. `routes/gtfs.js`, `config/feeds.js`, `middleware/cache.js`) instead of a single monolithic file
- [x] Add request logging middleware (`pino-http`) for debugging and observability
- [x] Add rate-limiting middleware (`express-rate-limit`) to prevent abuse of the proxy endpoint
- Replace the ad-hoc `fetchBuffer` Promise with `node:https` — or switch to `node-fetch`/`undici` for cleaner async code
- [x] Add proper error classification (network error vs auth error vs upstream 5xx) so the frontend can show distinct messages
- [x] Make the cache TTL configurable via environment variable instead of hardcoded 30000ms
- [x] Add a `/health` endpoint for uptime monitoring and load-balancer health checks
- [x] Add environment variable validation at startup (fail fast if `PTV_API_KEY` is missing)
- [x] Graceful shutdown handler (`SIGTERM`/`SIGINT`) to close the server cleanly

## Frontend (`script.js`)

- [x] Extract UI components into separate files (e.g. `components/map.js`, `components/dashboard.js`, `utils/format.js`) — the single ~1075-line file was becoming hard to maintain
- Replace raw DOM manipulation with a small reactive pattern or vanilla web components for better state management
- [x] Debounce the route search input handler to avoid excessive re-renders during fast typing
- Handle network errors more gracefully — show a retry button with exponential backoff instead of a static error message
- Add a loading skeleton / shimmer for stat cards while data is fetched
- [x] Move Leaflet tile URL and map defaults into a config object instead of hardcoding in `initMap()`
- [x] Add keyboard navigation support for the sidebar (arrow keys, Enter/Space to activate)
- [x] Add ARIA labels to interactive elements (nav buttons, feed selector, theme toggle) for accessibility

## CSS / Design (`style.css`)

- Extract CSS custom properties into a dedicated `tokens.css` file for better organisation
- [x] Add `prefers-reduced-motion` media query to disable toast slide animations for users with vestibular disorders
- [x] Add `prefers-color-scheme` support so the initial theme respects the OS setting before JS loads
- Use a CSS reset or `normalize.css` to smooth cross-browser rendering differences
- Add print stylesheet to hide sidebar when printing dashboard data

## Backend (additional)

- [x] Add request timeout (15s) on upstream fetches
- [x] Add retry with backoff (2 retries, 1s/2s delay) on upstream 5xx and network errors
- [x] Add Express error middleware (catch-all `(err, req, res, next)`)
- [x] Add compression middleware (gzip all responses)
- [x] Add cache size limit (evict oldest when >100 entries)
- [x] Add code coverage flag (`--experimental-test-coverage`)
- [x] Configure ESLint + Prettier, run lint:fix and format
- [x] Move inline theme script to external file (fix CSP violation)
- [x] Add integration tests with supertest (full middleware chain via Express, not isolated handler)
- [x] Refactor server.js to export app for supertest (startup behind `require.main === module` guard)
- [x] Add retry, timeout, and size-limit unit tests (4 tests, total 41)

## Frontend (additional)

- [x] ES modules with type="module", src/ directory structure
- [x] Early theme init script (runs before CSS render)
- [x] prefers-reduced-motion support via CSS
- [x] prefers-color-scheme support via CSS + early JS
- [x] Keyboard nav with arrow keys for sidebar tabs
- [x] ARIA roles (tablist, tab, aria-selected, tabindex management)
- [x] Debounce route search input (250ms)

## Security

- [x] Add CORS configuration (even if same-origin, explicit is better than implicit) — currently relies on default Express behaviour
- [x] Set security HTTP headers via `helmet` middleware (X-Content-Type-Options, X-Frame-Options, CSP, etc.)
- [x] Sanitise and validate the `limit` query parameter as a positive integer (currently only capped at 200, but passing `NaN` or negative values could cause unexpected behaviour)
- [x] Add input size limits to prevent extremely large responses from consuming all server memory
- Consider adding a CSRF token for any future mutation endpoints
- [x] Switch Let's Encrypt to DNS-01 challenge — no port 80 forwarding needed on home router (see `ROADMAP/home-deployment-security.md`)
- [x] Add IP allowlist middleware for `/metrics` endpoint (`middleware/restrictMetrics.js`)
- [x] Add SRI integrity hashes to all CDN resources (Leaflet CSS/JS, Lucide), pin Lucide to specific version
- [x] Make rate limiter per-IP explicit with `keyGenerator: (req) => req.ip`
- [x] Harden Docker container: `read_only: true`, `cap_drop: [ALL]`, `tmpfs: /tmp`, `no-new-privileges`
- [x] Remove `--duck-token` CLI arg from `setup_pi.py` — token now env-only (`DUCKDNS_TOKEN`)

## Deployment / Infrastructure

- [x] Add a `Dockerfile` and `docker-compose.yml` for containerised deployment (simplifies the Raspberry Pi setup)
- The Python deployment scripts could be converted to Ansible playbooks for idempotent provisioning
- Add a CI/CD pipeline stub (GitHub Actions) for linting on PR and auto-deploy on merge to main
- Consider using PM2 or `systemd` watchdog to auto-restart the Node process if it crashes
- [x] Add Prometheus metrics endpoint (`/metrics`) for monitoring cache hit rates, request latency, and upstream API errors

## Monitoring / Observability

- [x] Add structured logging (`pino`) instead of `console.log` — pipe to a file or journald on the Pi
- Add client-side performance instrumentation (time-to-data, map render time)
