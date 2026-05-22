#!/usr/bin/env python3
"""
Provision a real Let's Encrypt SSL certificate using certbot --nginx.
Replaces the self-signed certificate with a trusted CA-signed one.

Prerequisites:
  - Port 80 forwarded on your router to this machine
  - Domain (e.g. ptv-tracker.duckdns.org) resolves to your public IP
  - nginx is running and serving on port 80

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
        domain_ip = socket.getaddrinfo(domain, 80)[0][4][0]
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


def check_local_nginx():
    """Verify nginx is running locally on port 80."""
    try:
        result = subprocess.run(
            ["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}",
             "http://localhost"],
            capture_output=True, text=True, timeout=5,
        )
        if result.returncode == 0 and result.stdout not in ("", "000"):
            print(f"  ✓ nginx is responding locally (HTTP {result.stdout})")
            return True
    except subprocess.TimeoutExpired:
        pass
    print("  WARNING: nginx doesn't appear to be running locally.")
    print("  Check: sudo systemctl status nginx")
    return False


def write_http_nginx(domain, port):
    """Write a temporary HTTP-only nginx config (no SSL references)."""
    nginx_text = f"""server {{
    listen 80;
    server_name {domain};

    location / {{
        proxy_pass http://127.0.0.1:{port};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }}
}}
"""
    with open("/etc/nginx/sites-available/ptv-tracker", "w") as f:
        f.write(nginx_text)
    print("  ✓ Temporary HTTP-only nginx config written")


def provision_cert(domain, email, port):
    """Run certbot to get a real certificate."""

    live_dir = pathlib.Path(f"/etc/letsencrypt/live/{domain}")
    archive_dir = pathlib.Path(f"/etc/letsencrypt/archive/{domain}")
    renewal_file = pathlib.Path(f"/etc/letsencrypt/renewal/{domain}.conf")

    # Remove old cert data so certbot creates a fresh live directory
    for d in [live_dir, archive_dir]:
        if d.exists():
            print(f"Removing old certificate data: {d}")
            shutil.rmtree(str(d))
    if renewal_file.exists():
        renewal_file.unlink()

    # Also handle -0001 suffixed directories from previous failed runs
    for p in pathlib.Path("/etc/letsencrypt/live").glob(f"{domain}-*"):
        print(f"Removing stale cert directory: {p}")
        shutil.rmtree(str(p))
    for p in pathlib.Path("/etc/letsencrypt/archive").glob(f"{domain}-*"):
        print(f"Removing stale archive directory: {p}")
        shutil.rmtree(str(p))

    # Switch nginx to HTTP-only temporarily so certbot's --nginx plugin can work
    write_http_nginx(domain, port)
    run(["nginx", "-t"])
    run(["systemctl", "reload", "nginx"])
    print()

    print("Requesting Let's Encrypt certificate...")
    print(f"  Domain: {domain}")
    print(f"  Email:  {email}")
    print()

    result = subprocess.run([
        "certbot", "--nginx",
        "-d", domain,
        "--agree-tos",
        "--email", email,
        "--redirect",
        "--non-interactive",
    ], capture_output=True, text=True)

    print(result.stdout)
    if result.stderr:
        for line in result.stderr.strip().split("\n"):
            print("  " + line)

    if result.returncode != 0:
        print()
        print("=" * 50)
        print("  Certbot failed. Most common causes:")
        print()
        print("  1. Port 80 is not forwarded to this Pi")
        print("     → On your router, forward TCP 80 to 192.168.1.35")
        print()
        print("  2. Your router's web interface is on port 80")
        print("     → Change the router's admin interface to a different port")
        print()
        print("  3. A firewall is blocking port 80")
        print("     → Check your router's firewall rules")
        print()
        print("  After fixing, re-run this script.")
        print("=" * 50)
        sys.exit(1)

    print("✓ Certificate obtained from Let's Encrypt!")
    print()


def verify_cert(domain):
    """Verify the certificate is in place and nginx is working."""
    live_dir = pathlib.Path(f"/etc/letsencrypt/live/{domain}")

    if not live_dir.exists():
        print(f"ERROR: Certificate directory not found at {live_dir}")
        print("Checking for alternate paths...")
        alternates = list(pathlib.Path("/etc/letsencrypt/live").glob(f"{domain}*"))
        if alternates:
            print(f"  Found: {alternates[0]}")
            print("  Re-run with clean state to fix.")
        sys.exit(1)

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
        description="Provision a real Let's Encrypt SSL certificate for the PTV web app"
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
    print("=== PTV Tracker — Let's Encrypt SSL Provisioning ===")
    print(f"  Domain: {args.domain}")
    print(f"  Email:  {args.email}")
    print()

    if not args.skip_check:
        check_domain(args.domain)
        check_local_nginx()
    else:
        print("Skipping prerequisite checks.")

    print()

    provision_cert(args.domain, args.email, args.port)
    verify_cert(args.domain)

    print()
    print("=" * 50)
    print("  All done!")
    print()
    print(f"  Your site is now using a real HTTPS certificate.")
    print(f"  Open https://{args.domain} in your browser.")
    print(f"  The security warning should be gone.")
    print("=" * 50)


if __name__ == "__main__":
    main()
