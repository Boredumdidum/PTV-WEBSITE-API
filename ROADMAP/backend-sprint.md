# Back-End / Security Developer — Sprint Plan

## Task List
- [x] Extract `server.js` into modular structure (routes, config, middleware)
- [x] Add structured logging (e.g. `pino`)
- [x] Add request logging middleware (`morgan` or `pino-http`)
- [x] Add `/health` endpoint for monitoring
- [x] Classify upstream errors and return distinct HTTP status codes
- [x] Validate required env vars at startup (fail fast)
- [x] Make cache TTL configurable via environment variable
- [ ] Add rate-limiting middleware (`express-rate-limit`)
- [ ] Add `helmet` for security HTTP headers
- [ ] Validate `limit` query param as a positive integer; sanitise all inputs
- [ ] Add HTTP request size limits to prevent OOM
- [ ] Add graceful shutdown on `SIGTERM`/`SIGINT`
- [ ] Create `Dockerfile` and `docker-compose.yml` for containerised deployment
- [ ] Create `.dockerignore`
- [ ] Add GitHub Actions workflow stub (lint on PR, build check, auto-deploy to Pi)
- [ ] Update Raspberry Pi setup docs with Docker deployment path
- [ ] Add unit tests for cache logic, feed validation, and error classification
- [ ] Add JSDoc comments to all exported backend functions
- [ ] Document all environment variables in `README.md`
- [ ] Switch Let's Encrypt renewal from HTTP-01 to DNS-01 challenge (no port 80 dependency)
- [ ] Remove port 80 server block from nginx config template in `setup_pi.py`
- [ ] Write DuckDNS API hook script for certbot DNS-01 automation
- [ ] Remove port 80 references from `provision_ssl.py`

## Weekly Phases

### Phase 1 — Foundations
- [x] Extract `server.js` into `routes/gtfs.js` + `config/feeds.js` + `middleware/cache.js`
- [x] Add environment variable validation at startup (fail fast on missing `PTV_API_KEY`)
- [x] Make cache TTL configurable via `CACHE_TTL_MS` env var

### Phase 2 — Security Hardening
- Add `helmet` middleware with secure defaults
- Add `express-rate-limit` to `/api/gtfs` endpoint
- Validate and sanitise `limit` and `feed` query parameters
- Add HTTP body/payload size limits
- Audit `.env` file handling and document `chmod 600`
- Remove port 80 server block from nginx config template in `setup_pi.py`
- Remove port 80 references from `provision_ssl.py`

### Phase 3 — Observability
- [x] Add structured logging (`pino`) with request ID correlation
- [x] Add request logging middleware (`pino-http`)
- [x] Add `/health` endpoint with cache status and upstream reachability
- [x] Classify upstream errors (network vs auth vs 5xx) and return distinct HTTP status codes
- [x] Document UptimeRobot dashboard URL in setup docs: [https://stats.uptimerobot.com/5o9cNzBkeD/803146241](https://stats.uptimerobot.com/5o9cNzBkeD/803146241)

### Phase 4 — Containerisation
- Implement graceful shutdown (`SIGTERM`/`SIGINT` handlers)
- Create `Dockerfile` (multi-stage, Node 20 Alpine)
- Create `docker-compose.yml` with service definition and env file
- Create `.dockerignore`

### Phase 5 — Deployment Pipeline
- Update Raspberry Pi setup docs (`docs/raspberry-pi-setup.md`) with Docker deployment path
- Add GitHub Actions workflow stub (lint on PR, build check, auto-deploy to Pi)

### Phase 6 — DNS Automation & Unit Tests
- Switch Let's Encrypt renewal from HTTP-01 to DNS-01 challenge
- Write DuckDNS API hook script for certbot DNS-01 automation
- Update `provision_ssl.py` to use DNS-01 instead of HTTP-01
- Add unit tests for cache logic, feed validation, and error classification (using `node:test` or `vitest`)

### Phase 7 — Final Documentation
- Add JSDoc comments to all exported backend functions
- Document all environment variables in `README.md`
- Final integration test — deploy to staging, verify all 5 feeds load correctly, Docker container starts cleanly
