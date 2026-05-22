# Raspberry Pi deployment

Deploy the PTV GTFS-RT proxy on a Raspberry Pi with DuckDNS and HTTPS.

## Two deployment paths

| Approach | Port forwarding? | Browser warning? | When to use |
|---|---|---|---|
| **Self-signed** (default) | No | Yes (expected) | Quick setup, local/private use |
| **Let's Encrypt** | Yes (port 80) | No | Public-facing, want trusted cert |

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

## Remove the browser warning (Let's Encrypt, needs port 80)

Once the Pi is working with the self-signed cert, you can replace it with a trusted Let's Encrypt certificate.

### Prerequisites

Forward **TCP port 80** on your router to the Pi (`192.168.1.35`). Without this, Let's Encrypt cannot verify domain ownership.

### Run the provisioning script

```bash
sudo python3 /opt/ptv-tracker/scripts/provision_ssl.py \
  --domain ptv-tracker.duckdns.org \
  --email you@example.com
```

This script:
1. Checks that `ptv-tracker.duckdns.org` resolves to your public IP
2. Verifies nginx is responding locally on port 80
3. Removes any old self-signed certificate data
4. Temporarily switches nginx to HTTP-only mode
5. Runs `certbot --nginx` to obtain and install a Let's Encrypt certificate
6. Restores HTTPS with the new trusted certificate

After it completes, the browser warning will be gone. Certbot also sets up automatic renewal.

---

## Options reference

### `setup_pi.py` flags

| Flag | Purpose |
|---|---|
| `--app-dir PATH` | **Required** — deployment path (e.g. `/opt/ptv-tracker`) |
| `--domain DOMAIN` | Domain for cert and nginx (default: `ptv-tracker.duckdns.org`) |
| `--duck-token TOKEN` | DuckDNS token for dynamic DNS updates |
| `--skip-ssl` | Skip certificate generation (HTTP only) |
| `--skip-duckdns` | Skip DuckDNS cron setup |
| `--skip-node` | Skip Node.js installation |
| `--skip-npm` | Skip `npm install` |
| `--cert-days N` | Self-signed cert validity (default: 3650) |

### `provision_ssl.py` flags

| Flag | Purpose |
|---|---|
| `--domain DOMAIN` | **Required** — domain to get a certificate for |
| `--email EMAIL` | **Required** — for Let's Encrypt notifications |
| `--port PORT` | Local backend port (default: 3000) |
| `--skip-check` | Skip prerequisite checks |

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
10. Configures nginx as an HTTPS reverse proxy with HTTP→HTTPS redirect
11. Sets up DuckDNS cron job for dynamic DNS (if token provided)

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

**Option B — Let's Encrypt (needs port 80 forwarded):**
```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d ptv-tracker.duckdns.org --redirect
```

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
    listen 80;
    server_name ptv-tracker.duckdns.org;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name ptv-tracker.duckdns.org;

    ssl_certificate /etc/letsencrypt/live/ptv-tracker.duckdns.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ptv-tracker.duckdns.org/privkey.pem;

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
sudo chmod 700 /etc/duckdns/duck.sh
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
curl -k -I https://localhost
```

Open `https://ptv-tracker.duckdns.org` (or your Pi's IP) and load a feed.

---

## Notes

- The API key lives in `.env` only — never in frontend JS.
- The app listens on port 3000 internally; nginx terminates TLS on 443.
- GTFS-RT responses are cached for 30 seconds by the proxy.
- To regenerate a self-signed cert at any time: `python3 scripts/generate_certs.py --install`
- To replace with Let's Encrypt later: `python3 scripts/provision_ssl.py --domain ... --email ...`
