# Back-End / Security Developer — Sprint Plan

## Task List

- [x] Extract `server.js` into modular structure (routes, config, middleware)
- [x] Add structured logging (e.g. `pino`)
- [x] Add request logging middleware (`morgan` or `pino-http`)
- [x] Add `/health` endpoint for monitoring
- [x] Classify upstream errors and return distinct HTTP status codes
- [x] Validate required env vars at startup (fail fast)
- [x] Make cache TTL configurable via environment variable
- [x] Add rate-limiting middleware (`express-rate-limit`)
- [x] Add `helmet` for security HTTP headers
- [x] Validate `limit` query param as a positive integer; sanitise all inputs
- [x] Add HTTP request size limits to prevent OOM (1kb JSON body, 10MB upstream response)
- [x] Add graceful shutdown on `SIGTERM`/`SIGINT`
- [x] Create `Dockerfile` and `docker-compose.yml` for containerised deployment
- [x] Create `.dockerignore`
- [ ] Add GitHub Actions workflow stub (lint on PR, build check, auto-deploy to Pi)
- [x] Update Raspberry Pi setup docs with Docker deployment path
- [x] Add unit tests for cache logic, feed validation, and error classification
- [x] Add JSDoc comments to all exported backend functions
- [x] Document all environment variables in `README.md`
- [x] Add request timeout (15s) on upstream fetches
- [x] Add retry with backoff (2 retries) on upstream 5xx and network errors
- [x] Add Express error middleware (catch-all handler)
- [x] Add compression middleware (gzip)
- [x] Add cache size limit (evict oldest when >100 entries)
- [x] Add code coverage flag to npm test
- [x] Configure ESLint + Prettier with lint:fix and format scripts
- [x] Add integration tests with supertest (12 tests, full middleware chain)
- [x] Refactor server.js to export app for supertest
- [x] Switch Let's Encrypt renewal from HTTP-01 to DNS-01 challenge (no port 80 dependency)
- [x] Remove port 80 server block from nginx config template in `setup_pi.py`
- [x] Write DuckDNS API hook script for certbot DNS-01 automation (`scripts/duckdns-hook.sh`)
- [x] Remove port 80 references from `provision_ssl.py` (rewrote for DNS-01 challenge)

## Weekly Phases

### Phase 1 — Foundations

- [x] Extract `server.js` into `routes/gtfs.js` + `config/feeds.js` + `middleware/cache.js`
- [x] Add environment variable validation at startup (fail fast on missing `PTV_API_KEY`)
- [x] Make cache TTL configurable via `CACHE_TTL_MS` env var

### Phase 2 — Security Hardening

- [x] Add `helmet` middleware with secure defaults
- [x] Add `express-rate-limit` to `/api/gtfs` endpoint
- [x] Validate and sanitise `limit` and `feed` query parameters
- [x] Add HTTP body/payload size limits (1kb JSON body, 10MB upstream response)
- [x] Audit `.env` file handling and document `chmod 600`
- [x] Remove port 80 server block from nginx config template in `setup_pi.py`
- [x] Remove port 80 references from `provision_ssl.py` (rewritten for DNS-01)

### Phase 3 — Observability

- [x] Add structured logging (`pino`) with request ID correlation
- [x] Add request logging middleware (`pino-http`)
- [x] Add `/health` endpoint with cache status and upstream reachability
- [x] Classify upstream errors (network vs auth vs 5xx) and return distinct HTTP status codes
- [x] Document UptimeRobot dashboard URL in setup docs: [https://stats.uptimerobot.com/5o9cNzBkeD/803146241](https://stats.uptimerobot.com/5o9cNzBkeD/803146241)

### Phase 4 — Containerisation

- [x] Implement graceful shutdown (`SIGTERM`/`SIGINT` handlers)
- [x] Create `Dockerfile` (multi-stage, Node 20 Alpine)
- [x] Create `docker-compose.yml` with service definition and env file
- [x] Create `.dockerignore`

### Phase 5 — Deployment Pipeline

- [x] Update Raspberry Pi setup docs (`docs/raspberry-pi-setup.md`) with Docker deployment path
- Add GitHub Actions workflow stub (lint on PR, build check, auto-deploy to Pi)

### Phase 6 — DNS Automation & Unit Tests

- [x] Switch Let's Encrypt renewal from HTTP-01 to DNS-01 challenge
- [x] Write DuckDNS API hook script for certbot DNS-01 automation (`scripts/duckdns-hook.sh`)
- [x] Update `provision_ssl.py` to use DNS-01 instead of HTTP-01
- [x] Add unit tests for cache logic, feed validation, and error classification (using `node:test` or `vitest`)

### Phase 7 — Final Documentation

- [x] Add JSDoc comments to all exported backend functions
- [x] Document all environment variables in `README.md`
- [ ] Final integration test — deploy to staging, verify all 2 feeds load correctly, Docker container starts cleanly
