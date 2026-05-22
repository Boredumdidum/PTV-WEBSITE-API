# Raspberry Pi deployment (DuckDNS + HTTPS)

This guide assumes:
- Raspberry Pi OS 64-bit
- Domain: `ptv-tracker.duckdns.org`
- **No port forwarding required** — uses a self-signed certificate generated locally

## Quick start

1. Copy this project to the Pi:
   ```bash
   scp -r ./PTV-WEBSITE-API pi@<pi-ip>:/home/pi/ptv-tracker
   ```

2. Run the setup script as root:
   ```bash
   sudo python3 /home/pi/ptv-tracker/scripts/setup_pi.py \
     --duck-token "your-duckdns-token"
   ```

3. Set the API key:
   ```bash
   sudo nano /home/pi/ptv-tracker/.env
   # Add: PTV_API_KEY=your-key-here
   sudo systemctl restart ptv-tracker
   ```

4. Open `https://<pi-ip>` in your browser.
   - The browser will show a security warning — this is expected for a self-signed certificate.
   - Accept the warning and proceed.

### Options

| Flag | Purpose |
|---|---|
| `--domain ptv-tracker.duckdns.org` | Domain for cert and nginx (default: ptv-tracker.duckdns.org) |
| `--duck-token TOKEN` | DuckDNS token for dynamic DNS updates |
| `--app-dir PATH` | Install to a custom path (default: parent of `scripts/`) |
| `--skip-ssl` | Skip certificate generation (HTTP only) |
| `--skip-duckdns` | Skip DuckDNS cron setup |
| `--skip-node` | Skip Node.js installation |
| `--skip-npm` | Skip `npm install` |
| `--cert-days N` | Certificate validity in days (default: 3650) |

## What the script does

1. Installs system packages: nginx, git, curl, Python cryptography library
2. Installs Node.js (unless skipped)
3. Creates the `ptvtracker` system user and sets directory permissions
4. Runs `npm install`
5. Generates a self-signed TLS certificate via `generate_certs.py --install`
6. Writes a systemd service for the Node.js app
7. Configures nginx as an HTTPS reverse proxy with HTTP→HTTPS redirect
8. Sets up DuckDNS cron job for dynamic DNS (if token provided)

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
```

### 3) Generate TLS certificate

```bash
python3 scripts/generate_certs.py --install
```

This creates `/etc/letsencrypt/live/ptv-tracker.duckdns.org/{fullchain.pem, privkey.pem}`.

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
- To use a proper Let's Encrypt certificate later, open port 80 on your router and run `certbot --nginx`.
