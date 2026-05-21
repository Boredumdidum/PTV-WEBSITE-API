# Raspberry Pi 5 deployment (DuckDNS + HTTPS)

This guide assumes:
- Raspberry Pi OS 64-bit
- You control router port forwarding
- Domain: ptv-tracker.duckdns.org
- Port 443 is forwarded to the Pi (and port 80 temporarily for certbot)

## Quick start (recommended)

1. Copy this project to the Pi (example):
   - `scp -r ./PTV\ WEBSITE\ API pi@<pi-ip>:/opt/ptv-tracker`
2. Log into the Pi and run the setup script:
   - `sudo python3 /opt/ptv-tracker/scripts/setup_pi.py --domain ptv-tracker.duckdns.org --email you@example.com`
3. Set the API key on the Pi:
   - `sudo nano /opt/ptv-tracker/.env`
   - Add `PTV_API_KEY=your-key-here`
4. Start the service:
   - `sudo systemctl restart ptv-tracker`
5. Open https://ptv-tracker.duckdns.org

If you cannot open port 80, skip certbot in the script and use a DNS challenge later.

## Manual setup (no script)

### 1) System prep
- Ensure the Pi has a static IP or DHCP reservation
- Forward ports on the router:
  - TCP 443 -> Pi
  - TCP 80 -> Pi (temporary, for certbot)

Install dependencies:
- `sudo apt-get update`
- `sudo apt-get install -y nginx git curl ca-certificates python3-certbot-nginx`

Install Node.js (LTS):
- `curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -`
- `sudo apt-get install -y nodejs`

### 2) App install
- Place the project at `/opt/ptv-tracker`
- `cd /opt/ptv-tracker`
- `npm install`
- Create `/opt/ptv-tracker/.env` with:
  - `PTV_API_KEY=your-key-here`

### 3) Systemd service
Create `/etc/systemd/system/ptv-tracker.service`:

```
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

Enable it:
- `sudo systemctl daemon-reload`
- `sudo systemctl enable --now ptv-tracker`

### 4) Nginx reverse proxy
Create `/etc/nginx/sites-available/ptv-tracker`:

```
server {
    listen 80;
    server_name ptv-tracker.duckdns.org;

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
- `sudo ln -s /etc/nginx/sites-available/ptv-tracker /etc/nginx/sites-enabled/ptv-tracker`
- `sudo nginx -t`
- `sudo systemctl reload nginx`

### 5) DuckDNS updater
Create `/etc/duckdns/duck.sh`:

```
#!/bin/sh
curl -k "https://www.duckdns.org/update?domains=ptv-tracker&token=YOUR_TOKEN&ip="
```

Then:
- `sudo chmod 700 /etc/duckdns/duck.sh`
- Create `/etc/cron.d/duckdns` with:
  - `*/5 * * * * root /etc/duckdns/duck.sh >/dev/null 2>&1`

### 6) HTTPS cert (certbot)
- `sudo certbot --nginx -d ptv-tracker.duckdns.org --agree-tos --email you@example.com --redirect`

If certbot fails, check that port 80 is forwarded and not blocked.

## Validate
- `systemctl status ptv-tracker`
- `curl -I https://ptv-tracker.duckdns.org`
- Open https://ptv-tracker.duckdns.org and load a feed

## Notes
- Keep the API key in `/opt/ptv-tracker/.env`, never in frontend JS.
- The app listens on port 3000 internally; Nginx terminates TLS on 443.
- GTFS-RT responses are cached for 30 seconds by the proxy.
