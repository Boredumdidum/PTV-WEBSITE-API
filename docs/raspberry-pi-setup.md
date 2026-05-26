# Raspberry Pi deployment

Deploy the PTV GTFS-RT proxy on a Raspberry Pi with DuckDNS and HTTPS.

## Two deployment paths

| Approach                  | Port forwarding?                     | Browser warning? | When to use                         |
| ------------------------- | ------------------------------------ | ---------------- | ----------------------------------- |
| **Self-signed** (default) | No (port 443 only)                   | Yes (expected)   | Quick setup, local/private use      |
| **Let's Encrypt**         | No (port 443 only, DNS-01 challenge) | No               | Public-facing, want trusted cert    |
| **Docker** (recommended)  | No (port 443 only)                   | Depends on cert  | Production, avoids Node/npm on host |

---

## Docker deployment (recommended)

The project includes a `Dockerfile` (multi-stage Node 20 Alpine) and `docker-compose.yml`. This is the recommended deployment method — no Node.js or npm needed on the host, and the app runs as an unprivileged user inside the container.

### 1) Install Docker

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
```

### 2) Build and start

```bash
cd /opt/ptv-tracker
echo "PTV_API_KEY=your-key-here" > .env
sudo docker compose up -d --build
```

### 3) Verify

```bash
sudo docker compose ps
sudo docker compose logs --tail=20
curl -s http://localhost:3000/health | python3 -m json.tool
```

The container runs on port 3000. nginx on the host (configured by `setup_pi.py` or manually) proxies `https://ptv-tracker.duckdns.org` → `http://127.0.0.1:3000`.

### Useful Docker commands

```bash
sudo docker compose logs -f       # follow logs
sudo docker compose restart       # restart container
sudo docker compose down          # stop container
sudo docker compose up -d         # start container
sudo docker compose build         # rebuild image
```

---

## Quick start (self-signed, no port forwarding)

### 1) Copy the project to the Pi

```bash
scp -r ./PTV-WEBSITE-API pi@<pi-ip>:/opt/ptv-tracker
```

### 2) Run the setup script

```bash
ssh pi@<pi-ip>
sudo python3 /opt/ptv-tracker/scripts/setup_pi.py \
  --app-dir /opt/ptv-tracker \
  --duck-token "your-duckdns-token"
```

> **Always use `--app-dir`.** Without it, the systemd unit points to the clone directory and the service won't start.

### 3) Add your PTV API key

```bash
sudo nano /opt/ptv-tracker/.env
# Set: PTV_API_KEY=your-key-here
sudo systemctl restart ptv-tracker
```

### 4) Open in your browser

Visit `https://<pi-ip>`. The browser will show a security warning — this is expected for a self-signed certificate. Click **Advanced → Accept the Risk and Continue**.

---

## Remove the browser warning (Let's Encrypt, DNS-01 challenge)

Once the Pi is working with the self-signed cert, you can replace it with a trusted Let's Encrypt certificate.

This setup uses the **DNS-01 ACME challenge** — Let's Encrypt verifies domain ownership by checking a DNS TXT record, so no port 80 forwarding is needed. The `provision_ssl.py` script uses a [certbot manual hook](https://eff-certbot.readthedocs.io/en/stable/using.html#manual) (`scripts/duckdns-hook.sh`) to add/remove the TXT record via the DuckDNS API.

### Prerequisites

- DuckDNS token set up at `/etc/duckdns/duck.sh` (from running `setup_pi.py --duck-token` or manually)
- Pi must be reachable on port 443

### Run the provisioning script

```bash
sudo python3 /opt/ptv-tracker/scripts/provision_ssl.py \
  --domain ptv-tracker.duckdns.org \
  --email you@example.com
```

This script:

1. Checks that `ptv-tracker.duckdns.org` resolves to your public IP
2. Verifies the DuckDNS token exists
3. Writes the `duckdns-hook.sh` certbot hook (if not already present)
4. Cleans old certificate data
5. Requests a Let's Encrypt certificate using the DNS-01 challenge — the hook automatically adds a `_acme-challenge` TXT record via the DuckDNS API and waits 30s for propagation
6. Updates nginx config with the new cert paths and TLS hardening
7. Sets up automatic renewal via certbot's `cli.ini` with the DuckDNS hook

After it completes, the browser warning will be gone.

---

## Options reference

### `setup_pi.py` flags

| Flag                 | Purpose                                                         |
| -------------------- | --------------------------------------------------------------- |
| `--app-dir PATH`     | **Required** — deployment path (e.g. `/opt/ptv-tracker`)        |
| `--domain DOMAIN`    | Domain for cert and nginx (default: `ptv-tracker.duckdns.org`)  |
| `--duck-token TOKEN` | DuckDNS token for dynamic DNS updates                           |
| `--skip-ssl`         | Skip certificate generation (HTTP only)                         |
| `--skip-duckdns`     | Skip DuckDNS cron setup                                         |
| `--skip-ufw`         | Skip UFW firewall configuration                                 |
| `--allow-ports`      | Comma-separated extra ports for UFW (22,25,443,587 always open) |
| `--skip-node`        | Skip Node.js installation                                       |
| `--skip-npm`         | Skip `npm install`                                              |
| `--cert-days N`      | Self-signed cert validity (default: 3650)                       |

### `provision_ssl.py` flags

| Flag              | Purpose                                        |
| ----------------- | ---------------------------------------------- |
| `--domain DOMAIN` | **Required** — domain to get a certificate for |
| `--email EMAIL`   | **Required** — for Let's Encrypt notifications |
| `--port PORT`     | Local backend port (default: 3000)             |
| `--skip-check`    | Skip prerequisite checks                       |

> Uses DNS-01 challenge via DuckDNS hook — no port 80 needed.

---

## What the setup script does

1. Installs nginx, git, curl, Python cryptography library
2. Installs Node.js (unless `--skip-node`)
3. Creates the `ptvtracker` system user
4. Runs `npm install`
5. Creates `.env` if it doesn't exist (prompts you to add `PTV_API_KEY`)
6. Changes ownership of `app-dir` to `ptvtracker` — **after** npm install and .env creation
7. Generates a self-signed TLS certificate via `generate_certs.py --install`
8. Verifies `node` binary and `server.js` exist before writing configs
9. Writes a systemd service for the Node.js app
10. Configures nginx as an HTTPS reverse proxy (port 443 only — no HTTP redirect, no port 80 listener)
11. Sets up DuckDNS cron job for dynamic DNS (if token provided)
12. Configures UFW firewall (deny incoming by default, allow 443, allow SSH unless `--no-ssh`)

---

## Manual setup (without the script)

### 1) System packages

```bash
sudo apt-get update
sudo apt-get install -y nginx git curl ca-certificates python3-cryptography
```

### 2) Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 3) App directory

```bash
mkdir -p /opt/ptv-tracker
# Copy the project files here, then:
cd /opt/ptv-tracker
npm install
echo "PTV_API_KEY=your-key-here" > .env
sudo chown -R ptvtracker:ptvtracker /opt/ptv-tracker
```

### 4) TLS certificate (choose one)

**Option A — Self-signed (no port forwarding):**

```bash
python3 scripts/generate_certs.py --install
```

**Option B — Let's Encrypt (DNS-01 challenge, no port forwarding needed):**

```bash
sudo apt-get install -y certbot
sudo certbot certonly --manual --preferred-challenges dns \
  -d ptv-tracker.duckdns.org --agree-tos --email you@example.com
```

You'll be prompted to add a TXT record to your DuckDNS domain. Use the DuckDNS API to set it, then proceed.

### 5) Systemd service

Create `/etc/systemd/system/ptv-tracker.service`:

```ini
[Unit]
Description=PTV GTFS-RT proxy
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=ptvtracker
WorkingDirectory=/opt/ptv-tracker
EnvironmentFile=/opt/ptv-tracker/.env
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now ptv-tracker
```

### 6) Nginx reverse proxy

Create `/etc/nginx/sites-available/ptv-tracker`:

```nginx
server {
    listen 443 ssl;
    http2 on;
    server_name ptv-tracker.duckdns.org;

    ssl_certificate /etc/letsencrypt/live/ptv-tracker.duckdns.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ptv-tracker.duckdns.org/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security headers and rate limiting handled by the Express app
    # (helmet + express-rate-limit middleware)

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/ptv-tracker /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

> No port 80 server block — using DNS-01 challenge, no HTTP endpoint needed.

### 7) DuckDNS updater

```bash
sudo mkdir -p /etc/duckdns
```

Create `/etc/duckdns/duck.sh`:

```bash
#!/bin/sh
curl -k "https://www.duckdns.org/update?domains=ptv-tracker&token=YOUR_TOKEN&ip="
```

```bash
sudo chmod 600 /etc/duckdns/duck.sh
```

Create `/etc/cron.d/duckdns`:

```
*/5 * * * * root /etc/duckdns/duck.sh >/dev/null 2>&1
```

Run it once to set the initial IP:

```bash
sudo bash /etc/duckdns/duck.sh
```

---

## Troubleshooting

### Service fails — "No such file or directory"

```
Failed to load environment files: No such file or directory
Failed to spawn 'start' task: No such file or directory
```

**Cause:** The systemd unit points to a path that doesn't exist, or files are owned by root.

**Fix:**

```bash
cat /etc/systemd/system/ptv-tracker.service   # check paths
ls -la /opt/ptv-tracker/server.js              # does server.js exist?
sudo chown -R ptvtracker:ptvtracker /opt/ptv-tracker
sudo systemctl restart ptv-tracker
```

### Service exits with code 1 (MODULE_NOT_FOUND)

```
Process: ... node server.js (code=exited, status=1/FAILURE)
journalctl shows: MODULE_NOT_FOUND
```

**Cause:** `npm install` hasn't been run, or `node_modules` is owned by root.

**Fix:**

```bash
cd /opt/ptv-tracker && npm install
sudo chown -R ptvtracker:ptvtracker /opt/ptv-tracker
sudo systemctl restart ptv-tracker
```

### nginx fails — "cannot load certificate key"

```
nginx: [emerg] cannot load certificate key
```

**Cause:** Self-signed cert hasn't been generated, or deleted before certbot ran.

**Fix:**

```bash
python3 /opt/ptv-tracker/scripts/generate_certs.py --install
sudo nginx -t
sudo systemctl reload nginx
```

### certbot fails — live directory already exists

```
An unexpected error occurred: directory exists at /etc/letsencrypt/live/ptv-tracker.duckdns.org
```

**Fix:** Use the `provision_ssl.py` script which handles this cleanup automatically:

```bash
sudo python3 /opt/ptv-tracker/scripts/provision_ssl.py \
  --domain ptv-tracker.duckdns.org \
  --email you@example.com
```

---

## Validate

```bash
systemctl status ptv-tracker
curl -k --resolve ptv-tracker.duckdns.org:443:127.0.0.1 -I https://ptv-tracker.duckdns.org
```

Open `https://ptv-tracker.duckdns.org` (or your Pi's IP) and load a feed.

---

## Notes

- The API key lives in `.env` only — never in frontend JS.
- The app listens on port 3000 internally; nginx terminates TLS on 443.
- GTFS-RT responses are cached for 30 seconds by the proxy (configurable via `CACHE_TTL_MS`).
- Upstream fetches time out after 15 seconds (configurable via `REQUEST_TIMEOUT_MS`).
- Security headers are set at the app level via the `helmet` middleware (7 headers).
- Rate limiting (60 req/min per IP) is applied to `/api/gtfs` via `express-rate-limit`.
- Structured JSON logging via `pino` and per-request logging via `pino-http`.
- The `/health` endpoint returns cache status, uptime, and upstream reachability.
- The `/metrics` endpoint returns Prometheus metrics (request duration, cache hit/miss, upstream latency).
- Log level configurable via `LOG_LEVEL` env var (default: `info`).
- To regenerate a self-signed cert at any time: `python3 scripts/generate_certs.py --install`
- To replace with Let's Encrypt later (DNS-01, no port 80 needed): `sudo python3 scripts/provision_ssl.py --domain ... --email ...`
- The `provision_ssl.py` script uses `scripts/duckdns-hook.sh` as a certbot manual hook to add/remove DNS TXT records via the DuckDNS API
- Uptime monitoring dashboard: [https://stats.uptimerobot.com/5o9cNzBkeD/803146241](https://stats.uptimerobot.com/5o9cNzBkeD/803146241)
