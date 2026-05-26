#!/usr/bin/env python3
"""
Provision a Let's Encrypt SSL certificate using DNS-01 challenge (no port 80).
Replaces the self-signed certificate with a trusted CA-signed one.

Prerequisites:
  - Domain (e.g. ptv-tracker.duckdns.org) resolves to your public IP
  - DuckDNS token set up at /etc/duckdns/duck.sh

Usage:
  sudo python3 scripts/provision_ssl.py --domain ptv-tracker.duckdns.org --email you@example.com
"""

import argparse
import os
import pathlib
import shutil
import socket
import subprocess
import sys


def run(cmd, check=True):
    print("  +", " ".join(cmd))
    subprocess.run(cmd, check=check)


def write_file(path, content, mode=None):
    path.parent.mkdir(parents=True, exist_ok=True)
    if isinstance(content, str):
        path.write_text(content, encoding="utf-8")
    else:
        path.write_bytes(content)
    if mode is not None:
        os.chmod(path, mode)


def ensure_root():
    if os.geteuid() != 0:
        print("Please run as root (use sudo).")
        sys.exit(1)


def check_domain(domain):
    """Check that the domain resolves to this machine's public IP."""
    print("Checking domain...")

    public_ip = subprocess.run(
        ["curl", "-s", "https://ifconfig.me"],
        capture_output=True, text=True,
    ).stdout.strip()

    if not public_ip:
        print("  Could not determine public IP.")
        return

    try:
        domain_ip = socket.getaddrinfo(domain, 443)[0][4][0]
    except socket.gaierror:
        print(f"  ERROR: Domain {domain} does not resolve via DNS.")
        print("  Make sure you've registered it at https://duckdns.org")
        sys.exit(1)

    if domain_ip != public_ip:
        print(f"  WARNING: {domain} resolves to {domain_ip}")
        print(f"  but this machine's public IP is {public_ip}")
        print("  Update your DuckDNS A record or wait for propagation.")
        print(f"  Run: curl 'https://www.duckdns.org/update?domains={domain.split('.')[0]}&token=YOUR_TOKEN&ip='")
        sys.exit(1)

    print(f"  ✓ {domain} resolves to {public_ip}")


def write_hook_script(script_dir):
    """Write the DuckDNS certbot hook script if not already present."""
    hook_path = script_dir / "duckdns-hook.sh"
    if hook_path.exists():
        print(f"  ✓ Hook script already exists at {hook_path}")
        return hook_path

    hook_content = '''#!/bin/sh
# certbot DNS-01 auth/cleanup hook for DuckDNS
set -e

HOOK_FILE=/etc/duckdns/duck.sh
TOKEN=$(grep -o 'token=[^&]*' "$HOOK_FILE" | head -1 | cut -d= -f2)

if [ -z "$TOKEN" ]; then
    echo "Error: could not extract DuckDNS token from $HOOK_FILE" >&2
    exit 1
fi

DOMAIN=$(echo "$CERTBOT_DOMAIN" | sed 's/\\.duckdns\\.org$//')
if [ -z "$DOMAIN" ]; then
    echo "Error: CERTBOT_DOMAIN not set or not a DuckDNS domain" >&2
    exit 1
fi

MODE="${1:-auth}"

case "$MODE" in
    auth)
        curl -s "https://www.duckdns.org/update?domains=$DOMAIN&token=$TOKEN&txt=$CERTBOT_VALIDATION&overwrite=" > /dev/null
        sleep 30
        ;;
    cleanup)
        curl -s "https://www.duckdns.org/update?domains=$DOMAIN&token=$TOKEN&txt=&overwrite=" > /dev/null
        ;;
    *)
        echo "Usage: $0 [auth|cleanup]" >&2
        exit 1
        ;;
esac
'''
    write_file(hook_path, hook_content, mode=0o755)
    print(f"  ✓ Hook script written to {hook_path}")
    return hook_path


def check_hook_token():
    """Verify the DuckDNS token file exists and has a token."""
    hook_file = pathlib.Path("/etc/duckdns/duck.sh")
    if not hook_file.exists():
        print("  WARNING: /etc/duckdns/duck.sh not found.")
        print("  Run setup_pi.py with --duck-token first, or create it manually.")
        print("  Without it, the DNS-01 challenge hook cannot authenticate.")
        return False

    content = hook_file.read_text()
    if "token=" not in content:
        print(f"  WARNING: No token found in {hook_file}")
        return False

    print(f"  ✓ DuckDNS token found at {hook_file}")
    return True


def clean_old_cert(domain):
    """Remove old certificate data so certbot creates fresh files."""
    for d in [
        pathlib.Path(f"/etc/letsencrypt/live/{domain}"),
        pathlib.Path(f"/etc/letsencrypt/archive/{domain}"),
    ]:
        if d.exists():
            print(f"  Removing old certificate data: {d}")
            shutil.rmtree(str(d))

    renewal_file = pathlib.Path(f"/etc/letsencrypt/renewal/{domain}.conf")
    if renewal_file.exists():
        renewal_file.unlink()

    for p in pathlib.Path("/etc/letsencrypt/live").glob(f"{domain}-*"):
        print(f"  Removing stale cert directory: {p}")
        shutil.rmtree(str(p))
    for p in pathlib.Path("/etc/letsencrypt/archive").glob(f"{domain}-*"):
        print(f"  Removing stale archive directory: {p}")
        shutil.rmtree(str(p))


def provision_cert(domain, email, hook_path):
    """Run certbot with DNS-01 challenge via DuckDNS hook."""
    print("Requesting Let's Encrypt certificate via DNS-01 challenge...")
    print(f"  Domain: {domain}")
    print(f"  Email:  {email}")
    print(f"  Hook:   {hook_path}")
    print()

    result = subprocess.run([
        "certbot", "certonly", "--manual",
        "--preferred-challenges", "dns",
        "--manual-auth-hook", f"{hook_path} auth",
        "--manual-cleanup-hook", f"{hook_path} cleanup",
        "-d", domain,
        "--agree-tos",
        "--email", email,
        "--non-interactive",
    ], capture_output=True, text=True)

    print(result.stdout)
    if result.stderr:
        for line in result.stderr.strip().split("\n"):
            print("  " + line)

    if result.returncode != 0:
        print()
        print("=" * 50)
        print("  Certbot failed. Common causes:")
        print()
        print("  1. DuckDNS token is missing or invalid")
        print("     → Check /etc/duckdns/duck.sh contains a valid token")
        print()
        print("  2. DNS propagation timed out")
        print("     → The hook script waits 30s; some DNS setups need longer")
        print("     → Increase the sleep in the hook script or run the")
        print("       certbot command manually with a longer delay")
        print()
        print("  3. Domain does not resolve to this machine")
        print("     → Verify your DuckDNS A record is correct")
        print("=" * 50)
        sys.exit(1)

    print("✓ Certificate obtained from Let's Encrypt!")
    print()


def write_nginx(domain, port):
    """Update nginx config with Let's Encrypt cert paths and TLS hardening."""
    ssl_cert = f"/etc/letsencrypt/live/{domain}/fullchain.pem"
    ssl_key = f"/etc/letsencrypt/live/{domain}/privkey.pem"

    nginx_text = f"""server {{
    listen 443 ssl http2;
    server_name {domain};

    ssl_certificate {ssl_cert};
    ssl_certificate_key {ssl_key};
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security headers and rate limiting handled by the Express app
    # (helmet + express-rate-limit middleware)

    location / {{
        proxy_pass http://127.0.0.1:{port};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }}
}}

# No port 80 -- using DNS-01 challenge, no HTTP endpoint needed
"""
    nginx_path = pathlib.Path("/etc/nginx/sites-available/ptv-tracker")
    nginx_path.write_text(nginx_text)
    print(f"  ✓ nginx config written to {nginx_path}")


def setup_auto_renewal(hook_path, domain):
    """Set up certbot auto-renewal with the DuckDNS hook."""
    cli_ini = pathlib.Path("/etc/letsencrypt/cli.ini")
    hook_line = f"manual-auth-hook = {hook_path} auth"
    cleanup_line = f"manual-cleanup-hook = {hook_path} cleanup"

    existing = cli_ini.read_text() if cli_ini.exists() else ""
    if hook_line not in existing:
        with cli_ini.open("a") as f:
            f.write(f"\n# DuckDNS DNS-01 hook (added by provision_ssl.py)\n{hook_line}\n{cleanup_line}\n")
        print(f"  ✓ Auto-renewal hooks written to {cli_ini}")
    else:
        print("  ✓ Auto-renewal hooks already configured")


def verify_cert(domain):
    """Verify the certificate is in place and nginx is working."""
    live_dir = pathlib.Path(f"/etc/letsencrypt/live/{domain}")

    cert_path = live_dir / "fullchain.pem"
    key_path = live_dir / "privkey.pem"

    if not cert_path.exists() or not key_path.exists():
        print(f"ERROR: Certificate files not found in {live_dir}")
        sys.exit(1)

    print("Verifying certificate...")
    print(f"  Certificate: {cert_path} ✓")
    print(f"  Key:         {key_path} ✓")

    result = subprocess.run(
        ["openssl", "x509", "-in", str(cert_path), "-noout", "-dates", "-subject"],
        capture_output=True, text=True,
    )
    if result.returncode == 0:
        for line in result.stdout.strip().split("\n"):
            print(f"  {line}")

    print()
    print("Testing nginx config...")
    run(["nginx", "-t"])
    run(["systemctl", "reload", "nginx"])

    result = subprocess.run(
        ["curl", "-o", "/dev/null", "-s", "-w", "%{http_code}", "https://localhost"],
        capture_output=True, text=True, timeout=10,
    )
    if result.stdout == "200":
        print("✓ HTTPS is working locally!")
    else:
        print(f"  HTTPS returned status {result.stdout}")
        print("  Check: sudo systemctl status nginx")


def main():
    parser = argparse.ArgumentParser(
        description="Provision a Let's Encrypt SSL certificate via DNS-01 challenge (no port 80 needed)"
    )
    parser.add_argument("--domain", required=True,
                        help="Domain name (e.g. ptv-tracker.duckdns.org)")
    parser.add_argument("--email", required=True,
                        help="Email for Let's Encrypt notifications")
    parser.add_argument("--skip-check", action="store_true",
                        help="Skip prerequisite checks")
    parser.add_argument("--port", type=int, default=3000,
                        help="Local backend port (default: 3000)")
    args = parser.parse_args()

    ensure_root()

    print()
    print("=== PTV Tracker — Let's Encrypt SSL Provisioning (DNS-01) ===")
    print(f"  Domain: {args.domain}")
    print(f"  Email:  {args.email}")
    print(f"  No port 80 needed — using DuckDNS TXT record challenge")
    print()

    script_dir = pathlib.Path(__file__).resolve().parent

    if not args.skip_check:
        check_domain(args.domain)
        check_hook_token()
    else:
        print("Skipping prerequisite checks.")

    print()

    print("[1/4] Writing DuckDNS certbot hook script...")
    hook_path = write_hook_script(script_dir)
    print()

    print("[2/4] Cleaning old certificate data...")
    clean_old_cert(args.domain)
    print()

    print("[3/4] Requesting certificate from Let's Encrypt...")
    provision_cert(args.domain, args.email, hook_path)

    print("[4/4] Updating nginx config and setting up auto-renewal...")
    write_nginx(args.domain, args.port)
    verify_cert(args.domain)
    setup_auto_renewal(hook_path, args.domain)
    print()

    print("=" * 50)
    print("  All done!")
    print()
    print(f"  Your site is now using a real HTTPS certificate.")
    print(f"  Open https://{args.domain} in your browser.")
    print(f"  The security warning should be gone.")
    print()
    print(f"  Certificates auto-renew via certbot + DuckDNS hook.")
    print("=" * 50)


if __name__ == "__main__":
    main()
