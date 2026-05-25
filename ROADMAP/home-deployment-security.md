# Home Deployment Security — Raspberry Pi + DuckDNS + Home Router

## Threat Model

This runs on a Raspberry Pi on a home network, exposed to the internet via a home router and DuckDNS. The risk profile differs from cloud deployments — no DDoS protection, no cloud WAF, no managed firewall, and other family devices share the same LAN.

| Threat | Likelihood | Impact | Notes |
|---|---|---|---|
| Port scan / probe bots hitting port 443 | Very High | Low | Constant background noise on home IPs; nginx handles it fine |
| Brute-force SSH on the Pi | Medium | High | Default Pi has `pi` user with password; must disable password auth |
| API key leaked via `.env` backup or SD card | Low | High | SD card failure could expose `.env` if RMA'd without wipe |
| DuckDNS token stolen from Pi | Low | Medium | Lets attacker point your domain to their IP |
| Compromised device on LAN attacks Pi | Low | High | No IoT devices on network, but consider other LAN devices (laptops, phones) |
| SD card corruption takes site offline | Medium | Medium | Frequent writes + power loss risk. Mitigated below. |
| Let's Encrypt auto-renewal fails silently | Medium | Low | Cert expires, site shows SSL warning until manual fix |

---

## Home Router

### Port Forwarding
- Forward **only port 443** (HTTPS) to the Pi — never port 80, never 3000
- Assign a static IP to the Pi on the router (no DHCP in use on this network)
- Disable WAN admin access on the router — management should be LAN-only
- Check if your router supports **UPnP** — already disabled on this network

### Port 80 Is Not Used (DNS-01 Challenge)
This setup uses the **DNS-01 ACME challenge** for Let's Encrypt — no port 80 required. Instead of proving domain ownership by serving a file on port 80, certbot adds a TXT record to your DuckDNS domain via the DuckDNS API. This means:
- No port 80 forwarded on the router — ever
- No HTTP redirect server block in nginx
- Certificate renewal is fully automated via a DuckDNS hook script, not an HTTP listener
- One fewer attack surface on the Pi

### Router Recommendations
- Keep router firmware updated
- Change default admin credentials if you haven't already
- Disable WPS, disable ping from WAN, disable remote management
- If your router supports **VLANs**, put the Pi and family devices on separate VLANs with a firewall rule allowing only port 443 inbound to the Pi

---

## DuckDNS

### Current Risks
- Token stored in plaintext at `/etc/duckdns/duck.sh`
- Script runs every 5 minutes as root via cron
- DuckDNS has no auth beyond the token — anyone with the token can hijack your domain

### Mitigations
- Restrict `duck.sh` permissions:
  ```bash
  sudo chmod 600 /etc/duckdns/duck.sh
  sudo chown root:root /etc/duckdns/duck.sh
  ```
- Monitor your domain periodically — if it stops resolving to your IP, check the token hasn't been compromised

---

## Raspberry Pi Hardening

### SSH (optional)
SSH is not required for this setup — you can manage the Pi directly with a keyboard and monitor. If you do want remote access:
- Disable password authentication and use SSH keys only
- Install **fail2ban** to block brute-force attempts:
  ```bash
  sudo apt-get install -y fail2ban
  ```

### System Updates
- Set up automatic security updates:
  ```bash
  sudo apt-get install -y unattended-upgrades
  sudo dpkg-reconfigure --priority=low unattended-upgrades
  ```
- Reboot weekly (cron) to apply kernel updates:
  ```bash
  sudo crontab -e
  # Add: 0 3 * * 0 /sbin/reboot
  ```

### Filesystem & SD Card Endurance

The Pi boots from SD card. Frequent writes (logs, system journals, npm cache) can wear out consumer-grade cards in months. Mitigations:

- **Use a high-endurance SD card** — Samsung Pro Endurance, SanDisk Max Endurance, or Industrial-rated cards are rated for continuous write workloads vs standard cards which fail after ~500-2000 write cycles
- **Move logs to RAM** — mount `/var/log` as `tmpfs` so logs live in memory and are discarded on reboot:
  ```bash
  echo "tmpfs /var/log tmpfs defaults,noatime,size=100M 0 0" | sudo tee -a /etc/fstab
  ```
  If you need persistent logs, pair this with `rsyslog` forwarding to a remote server
- **Mount `/tmp` and `/var/tmp` as tmpfs** — these directories see frequent writes from system processes:
  ```bash
  echo "tmpfs /tmp tmpfs defaults,noatime,size=128M 0 0" | sudo tee -a /etc/fstab
  echo "tmpfs /var/tmp tmpfs defaults,noatime,size=64M 0 0" | sudo tee -a /etc/fstab
  ```
- **Disable swap on the SD card** — swap thrashing kills SD cards quickly:
  ```bash
  sudo dphys-swapfile swapoff
  sudo dphys-swapfile uninstall
  sudo systemctl disable dphys-swapfile
  ```
- **Reduce systemd journal writes** — limit journal size and enable log rotation:
  ```bash
  sudo journalctl --vacuum-size=50M
  sudo nano /etc/systemd/journald.conf
  # Set: SystemMaxUse=50M
  ```
- **Use a quality power supply** — the official Raspberry Pi power supply (5.1V/2.5A+) prevents brownouts that cause filesystem corruption during writes
- **Consider USB SSD boot** — for maximum reliability, boot from a USB SSD instead of SD card. The Pi 4/5 supports USB boot natively. SSDs have 10-100x the write endurance of SD cards
- **Read-only root filesystem** — for a truly static setup, use `overlayroot` to make the root FS read-only, with all writes sent to a tmpfs overlay that's discarded on reboot

### Firewall
- Use `iptables` or `ufw` to restrict inbound traffic to only what's needed:
  ```bash
  sudo ufw default deny incoming
  sudo ufw default allow outgoing
  sudo ufw allow 443/tcp    # HTTPS
  sudo ufw allow ssh        # only if you need remote access
  sudo ufw enable
  ```

---

## nginx Hardening

The current nginx config handles basic reverse proxying. Strengthen it for internet exposure:

```nginx
server {
    listen 443 ssl http2;
    server_name ptv-tracker.duckdns.org;

    # Restrict TLS to modern standards
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security headers
    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options DENY;
    add_header X-XSS-Protection "0" always;
    add_header Referrer-Policy strict-origin-when-cross-origin;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()";

    # Rate limiting per IP
    limit_req zone=gtfs:10m rate=10r/s;
    limit_req_status 429;

    # Only allow GET and HEAD
    if ($request_method !~ ^(GET|HEAD)$) {
        return 405;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# No port 80 server block — using DNS-01 challenge, so no HTTP listener needed
```

Add to the `http` block in `/etc/nginx/nginx.conf`:

```nginx
# Rate limit zones
limit_req_zone $binary_remote_addr zone=gtfs:10m rate=10r/s;

# Drop large requests
client_body_buffer_size 1k;
client_max_body_size 1k;
```

### Additional nginx Tips
- Run `sudo nginx -t` after every config change
- Reload (not restart) to avoid downtime: `sudo systemctl reload nginx`
- Monitor access logs periodically: `tail -f /var/log/nginx/access.log` — look for unusual patterns

---

## API Key Security

- The `PTV_API_KEY` in `.env` is the single sensitive credential. Protect it:
  ```bash
  sudo chmod 600 /opt/ptv-tracker/.env
  sudo chown ptvtracker:ptvtracker /opt/ptv-tracker/.env
  ```
- The systemd `EnvironmentFile` directive reads the file as root before dropping to the `ptvtracker` user — this is correct behaviour
- If you back up the Pi SD card, ensure the `.env` file is excluded from backups that leave your home
- Rotate the PTV API key periodically from the [PTV Developer Portal](https://developer.ptv.vic.gov.au)
- The API key is never sent to the browser — confirmed by code review

---

## Monitoring & Alerts

### Uptime Monitoring
- **UptimeRobot**: [https://stats.uptimerobot.com/5o9cNzBkeD/803146241](https://stats.uptimerobot.com/5o9cNzBkeD/803146241) — monitors `https://ptv-tracker.duckdns.org` every 5 minutes, emails on downtime

### Log Rotation
Logs grow unbounded on the Pi's SD card — configure rotation:

```bash
sudo nano /etc/logrotate.d/ptv-tracker
```

```
/opt/ptv-tracker/logs/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
}
```

### What to Watch For
- `journalctl -u ptv-tracker --since "24 hours ago" | grep -i error` — backend errors
- `tail -f /var/log/nginx/access.log | grep -E " 4[0-9][0-9]| 5[0-9][0-9]"` — client/server errors
- `df -h` — SD card free space (logs can fill it quickly)
- `systemctl status ptv-tracker` — service health at a glance

---

## Physical Security

- The Pi is in a home — secure the physical location if possible (locked cupboard, basement, etc.)
- If you dispose of the SD card, **physically destroy it** (shredder or drill) — do not rely on reformatting alone
- Consider using full-disk encryption (LUKS) on the root filesystem — requires entering a passphrase on boot via SSH or local keyboard

---

## Checklist

- [x] Router: forwarded port 443 only (never 80), UPnP disabled, changed admin password, disabled WAN ping
- [x] Router: static IP assigned to Pi (no DHCP on this network)
- [x] DuckDNS: `duck.sh` permissions 600, DNS-01 automation script set up for cert renewal
- [ ] UFW: deny incoming by default, allow 443 (and SSH if needed)
- [ ] nginx: TLS 1.2/1.3 only, no port 80 server block, security headers added, rate limiting configured
- [ ] nginx: `client_max_body_size 1k`, only GET/HEAD allowed
- [x] `.env`: permissions 600, owned by ptvtracker
- [x] Unattended upgrades enabled
- [x] Uptime monitoring set up: [https://stats.uptimerobot.com/5o9cNzBkeD/803146241](https://stats.uptimerobot.com/5o9cNzBkeD/803146241)
- [ ] Log rotation configured for app and nginx logs
- [x] Physical access: Pi in a locked location
- [ ] SD card mitigations applied (tmpfs for logs/tmp, swap disabled, quality PSU, high-endurance card)
