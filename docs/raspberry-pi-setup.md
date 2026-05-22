# Raspberry Pi deployment (DuckDNS + HTTPS)

This guide assumes:
- Raspberry Pi OS 64-bit
- Domain: `ptv-tracker.duckdns.org`
- **No port forwarding required** — uses a self-signed certificate generated locally

## Quick start

1. Copy this project to the Pi:
   ```bash
   scp -r ./PTV-WEBSITE-API pi@<pi-ip>:/opt/ptv-tracker
   ```

2. Run the setup script as root with `--app-dir`:
   ```bash
   sudo python3 /opt/ptv-tracker/scripts/setup_pi.py \
     --app-dir /opt/ptv-tracker \
     --duck-token "your-duckdns-token"
   ```

3. Add your PTV API key:
   ```bash
   sudo nano /opt/ptv-tracker/.env
   # Set: PTV_API_KEY=your-key-here
   sudo systemctl restart ptv-tracker
   ```

4. Open `https://<pi-ip>` in your browser.
   - The browser will show a security warning — this is expected for a self-signed certificate.
   - Accept the warning and proceed.

### Options

| Flag | Purpose |
|---|---|
| `--app-dir PATH` | **Required** for system deployment (e.g. `/opt/ptv-tracker`) |
| `--domain ptv-tracker.duckdns.org` | Domain for cert and nginx (default: ptv-tracker.duckdns.org) |
| `--duck-token TOKEN` | DuckDNS token for dynamic DNS updates |
| `--skip-ssl` | Skip certificate generation (HTTP only) |
| `--skip-duckdns` | Skip DuckDNS cron setup |
| `--skip-node` | Skip Node.js installation |
| `--skip-npm` | Skip `npm install` |
| `--cert-days N` | Certificate validity in days (default: 3650) |

### Important: always use `--app-dir`

The script defaults `app-dir` to the *parent of the `scripts/` folder* (wherever you cloned the repo). For system deployment, always pass `--app-dir` explicitly:

```bash
sudo python3 scripts/setup_pi.py --app-dir /opt/ptv-tracker --duck-token "<token>"
```

If you omit `--app-dir`, the systemd service will point to your clone location and fail.

## What the script does

1. Installs system packages: nginx, git, curl, Python cryptography library
2. Installs Node.js (unless `--skip-node`)
3. Creates the `ptvtracker` system user
4. Runs `npm install`
5. Creates `.env` if it doesn't exist
6. Changes ownership of `app-dir` to `ptvtracker` — **after** npm install and .env creation
7. Generates a self-signed TLS certificate via `generate_certs.py --install`
8. Verifies `node` binary and `server.js` exist before writing configs
9. Writes a systemd service for the Node.js app
10. Configures nginx as an HTTPS reverse proxy with HTTP→HTTPS redirect
11. Sets up DuckDNS cron job for dynamic DNS (if token provided)

### Why this order matters

The script runs `npm install` and creates `.env` **before** `chown -R`. This ensures the `ptvtracker` service user owns all files — including `node_modules` and `.env`. Running `chown` too early would leave those files owned by root, causing the "No such file or directory" error when systemd tries to read them.

## Manual setup (no script)

### 1) System prep

```bash
sudo apt-get update
sudo apt-get install -y nginx git curl ca-certificates python3-cryptography
```

Install Node.js:
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 2) App install

```bash
# Place project at your chosen path
cd /opt/ptv-tracker
npm install

# Create .env with your API key
echo "PTV_API_KEY=your-key-here" > .env

# Important: set ownership BEFORE starting the service
sudo chown -R ptvtracker:ptvtracker /opt/ptv-tracker
```

### 3) Generate TLS certificate

```bash
python3 scripts/generate_certs.py --hostname ptv-tracker.duckdns.org --install
```

This creates `/etc/letsencrypt/live/ptv-tracker.duckdns.org/{fullchain.pem, privkey.pem}`.

Run `python3 scripts/generate_certs.py --help` for all options.

### 4) Systemd service

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

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now ptv-tracker
```

### 5) Nginx reverse proxy

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

Enable and reload:
```bash
sudo ln -s /etc/nginx/sites-available/ptv-tracker /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 6) DuckDNS updater

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

## Troubleshooting

### Service fails with "No such file or directory"

```
Failed to load environment files: No such file or directory
Failed to spawn 'start' task: No such file or directory
```

**Cause:** The systemd unit points to a path where files don't exist, or files are owned by root instead of `ptvtracker`.

**Fix:**
```bash
# Check what the service expects
cat /etc/systemd/system/ptv-tracker.service

# Verify the paths exist
ls -la /path/from/unit/server.js
ls -la /path/from/unit/.env

# Fix ownership
sudo chown -R ptvtracker:ptvtracker /opt/ptv-tracker
sudo systemctl restart ptv-tracker
```

### Service exits with code 1

```
Process: 12345 ExecStart=/usr/bin/node server.js (code=exited, status=1/FAILURE)
```

**Cause:** Node.js process crashed — usually a missing dependency or incorrect `.env`.

**Fix:**
```bash
# View the actual error
sudo journalctl -xeu ptv-tracker.service --no-pager | tail -20

# Likely fixes:
sudo chown -R ptvtracker:ptvtracker /opt/ptv-tracker   # fix ownership
sudo npm install                                        # reinstall deps
# Check /opt/ptv-tracker/.env has PTV_API_KEY set
```

### nginx fails to start

```
nginx: [emerg] cannot load certificate key
```

**Cause:** Self-signed cert not yet generated, or path mismatch.

**Fix:**
```bash
python3 /opt/ptv-tracker/scripts/generate_certs.py --install
sudo nginx -t
sudo systemctl reload nginx
```

## Validate

```bash
systemctl status ptv-tracker
curl -k -I https://localhost
```

Open `https://<pi-ip>` in a browser and load a feed.

## Notes

- Keep the API key in `.env`, never in frontend JS.
- The app listens on port 3000 internally; nginx terminates TLS on 443.
- GTFS-RT responses are cached for 30 seconds by the proxy.
- The self-signed certificate triggers a browser warning. This is expected and safe for local/private use.
- To replace with a proper Let's Encrypt certificate (no browser warning), forward ports 80 and 443 to this Pi on your router, then run:
  ```bash
  sudo python3 scripts/provision_ssl.py \
    --domain ptv-tracker.duckdns.org \
    --email you@example.com
  ```
