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


def check_prerequisites(domain):
    """Check that the domain resolves and port 80 is reachable."""
    print("Checking prerequisites...")

    public_ip = subprocess.run(
        ["curl", "-s", "https://ifconfig.me"],
        capture_output=True, text=True,
    ).stdout.strip()

    if not public_ip:
        print("WARNING: Could not determine public IP.")
        print("Make sure port 80 is forwarded to this machine.")
        return

    try:
        domain_ip = socket.getaddrinfo(domain, 80)[0][4][0]
    except socket.gaierror:
        print(f"ERROR: Domain {domain} does not resolve via DNS.")
        print("Make sure you've registered it at https://duckdns.org")
        sys.exit(1)

    if domain_ip != public_ip:
        print(f"WARNING: {domain} resolves to {domain_ip}")
        print(f"  but this machine's public IP is {public_ip}")
        print("  Update your DuckDNS A record or wait for propagation.")
        print(f"  Run: curl 'https://www.duckdns.org/update?domains={domain.split('.')[0]}&token=YOUR_TOKEN&ip='")
        sys.exit(1)

    print(f"  {domain} resolves to {domain_ip} ✓")
    print(f"  Public IP matches  ✓")
    print()

    check = subprocess.run(
        ["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}",
         f"http://{domain}/.well-known/acme-challenge/test"],
        capture_output=True, text=True, timeout=10,
    )
    if check.returncode != 0 or check.stdout != "404":
        print("WARNING: Port 80 does not appear to be reachable from the internet.")
        print("  Make sure port 80 is forwarded to this machine.")
        print("  Certbot may still work, but may timeout during the challenge.")
    else:
        print("  Port 80 reachable ✓")


def provision_cert(domain, email):
    """Run certbot to get a real certificate."""
    print("Installing certbot...")
    run(["apt-get", "install", "-y", "certbot", "python3-certbot-nginx"])
    print()

    print("Requesting Let's Encrypt certificate...")
    print(f"  Domain: {domain}")
    print(f"  Email:  {email}")
    print()

    run([
        "certbot", "--nginx",
        "-d", domain,
        "--agree-tos",
        "--email", email,
        "--redirect",
        "--non-interactive",
    ])
    print()
    print("✓ Certificate obtained from Let's Encrypt!")
    print()


def verify_cert(domain):
    """Verify the certificate is in place and nginx is working."""
    cert_path = pathlib.Path(f"/etc/letsencrypt/live/{domain}/fullchain.pem")
    key_path = pathlib.Path(f"/etc/letsencrypt/live/{domain}/privkey.pem")

    if not cert_path.exists() or not key_path.exists():
        print(f"ERROR: Certificate not found at /etc/letsencrypt/live/{domain}/")
        sys.exit(1)

    print("Verifying certificate...")
    print(f"  Certificate: {cert_path} ✓")
    print(f"  Key:         {key_path} ✓")

    result = subprocess.run(
        ["openssl", "x509", "-in", str(cert_path), "-noout", "-dates"],
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
        ["curl", "-o", "/dev/null", "-s", "-w", "%{http_code}", f"https://localhost"],
        capture_output=True, text=True, timeout=10,
    )
    if result.stdout == "200":
        print("✓ HTTPS is working!")
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
    args = parser.parse_args()

    ensure_root()

    print()
    print("=== PTV Tracker — Let's Encrypt SSL Provisioning ===")
    print(f"  Domain: {args.domain}")
    print(f"  Email:  {args.email}")
    print()

    if not args.skip_check:
        check_prerequisites(args.domain)
    else:
        print("Skipping prerequisite checks.")
        print()

    provision_cert(args.domain, args.email)
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
