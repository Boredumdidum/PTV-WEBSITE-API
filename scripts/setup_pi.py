#!/usr/bin/env python3
import argparse
import os
import pathlib
import shutil
import subprocess
import sys
import textwrap


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


def ensure_user(username, app_dir):
    result = subprocess.run(["id", "-u", username], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if result.returncode != 0:
        run([
            "useradd",
            "--system",
            "--home",
            app_dir,
            "--shell",
            "/usr/sbin/nologin",
            "--create-home",
            username,
        ])


def ensure_service_access(app_dir):
    resolved = pathlib.Path(app_dir).resolve()
    for parent in [resolved] + list(resolved.parents):
        if parent.exists():
            st = parent.stat()
            if not (st.st_mode & 0o011):
                os.chmod(parent, st.st_mode | 0o011)


def install_node():
    if shutil.which("node"):
        return
    run(["apt-get", "install", "-y", "curl", "ca-certificates"])
    run(["bash", "-c", "curl -fsSL https://deb.nodesource.com/setup_20.x | bash -"])
    run(["apt-get", "install", "-y", "nodejs"])


def write_systemd(service_user, app_dir, node_path):
    service_text = textwrap.dedent(
        f"""
        [Unit]
        Description=PTV GTFS-RT proxy
        After=network-online.target
        Wants=network-online.target

        [Service]
        Type=simple
        User={service_user}
        WorkingDirectory={app_dir}
        EnvironmentFile={app_dir}/.env
        ExecStart={node_path} server.js
        Restart=on-failure
        RestartSec=3

        [Install]
        WantedBy=multi-user.target
        """
    ).strip() + "\n"

    write_file(pathlib.Path("/etc/systemd/system/ptv-tracker.service"), service_text)


def write_nginx(domain, port):
    ssl_cert = f"/etc/letsencrypt/live/{domain}/fullchain.pem"
    ssl_key = f"/etc/letsencrypt/live/{domain}/privkey.pem"

    nginx_text = textwrap.dedent(
        f"""
        server {{
            listen 80;
            server_name {domain};
            return 301 https://$host$request_uri;
        }}

        server {{
            listen 443 ssl;
            server_name {domain};

            ssl_certificate {ssl_cert};
            ssl_certificate_key {ssl_key};

            location / {{
                proxy_pass http://127.0.0.1:{port};
                proxy_set_header Host $host;
                proxy_set_header X-Real-IP $remote_addr;
                proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
                proxy_set_header X-Forwarded-Proto $scheme;
            }}
        }}
        """
    ).strip() + "\n"

    write_file(pathlib.Path("/etc/nginx/sites-available/ptv-tracker"), nginx_text)
    enabled = pathlib.Path("/etc/nginx/sites-enabled/ptv-tracker")
    if not enabled.exists():
        enabled.symlink_to("/etc/nginx/sites-available/ptv-tracker")


def write_duckdns(domain, token):
    prefix = domain.split(".")[0]
    duck_script = f"#!/bin/sh\ncurl -k \"https://www.duckdns.org/update?domains={prefix}&token={token}&ip=\"\n"
    write_file(pathlib.Path("/etc/duckdns/duck.sh"), duck_script, mode=0o700)
    cron_text = "*/5 * * * * root /etc/duckdns/duck.sh >/dev/null 2>&1\n"
    write_file(pathlib.Path("/etc/cron.d/duckdns"), cron_text)


def main():
    parser = argparse.ArgumentParser(description="Setup Raspberry Pi for PTV GTFS-RT web app")
    parser.add_argument("--domain", default="ptv-tracker.duckdns.org")
    parser.add_argument("--app-dir")
    parser.add_argument("--service-user", default="ptvtracker")
    parser.add_argument("--port", default="3000")
    parser.add_argument("--duck-token", default=os.environ.get("DUCKDNS_TOKEN"))
    parser.add_argument("--cert-days", type=int, default=3650,
                        help="Self-signed certificate validity in days (default: 3650)")
    parser.add_argument("--skip-ssl", action="store_true",
                        help="Skip self-signed certificate generation (HTTP only)")
    parser.add_argument("--skip-node", action="store_true")
    parser.add_argument("--skip-npm", action="store_true")
    parser.add_argument("--skip-duckdns", action="store_true")
    args = parser.parse_args()

    ensure_root()

    print()
    print("=== PTV Tracker — Raspberry Pi Setup ===")
    print(f"  App dir:   {args.app_dir or '(auto)'}")
    print(f"  Domain:    {args.domain}")
    print(f"  DuckDNS:   {'yes' if args.duck_token else 'no'}")
    print(f"  SSL:       {'self-signed' if not args.skip_ssl else 'no (HTTP)'}")
    print()

    print("[1/7] Installing system packages...")
    run(["apt-get", "update"])
    run(["apt-get", "install", "-y", "nginx", "git", "curl", "ca-certificates",
         "python3-cryptography"])
    print("  ✓ System packages installed")
    print()

    if not args.skip_node:
        print("[2/7] Installing Node.js...")
        install_node()
        node_ver = subprocess.run(["node", "--version"], capture_output=True, text=True).stdout.strip()
        print(f"  ✓ Node.js {node_ver}")
    else:
        print("[2/7] Skipping Node.js installation")
    print()

    if args.app_dir:
        app_dir = os.path.abspath(args.app_dir)
    else:
        app_dir = os.path.abspath(pathlib.Path(__file__).resolve().parent.parent)
    pathlib.Path(app_dir).mkdir(parents=True, exist_ok=True)

    print("[3/7] Setting up app directory and service user...")
    ensure_user(args.service_user, app_dir)
    ensure_service_access(app_dir)
    print(f"  ✓ User '{args.service_user}' ready")
    print(f"  ✓ Directory: {app_dir}")
    print()

    if not args.skip_npm:
        node_modules = pathlib.Path(app_dir) / "node_modules"
        if node_modules.exists():
            print("[4/7] node_modules already exists, skipping npm install")
        else:
            print("[4/7] Installing Node.js dependencies (npm install)...")
            run(["bash", "-c", f"cd {app_dir} && npm install"])
            print("  ✓ Dependencies installed")
    else:
        print("[4/7] Skipping npm install")
        if not (pathlib.Path(app_dir) / "node_modules").exists():
            print("  WARNING: node_modules not found — service will fail to start.")
            print("  Run: cd {app_dir} && npm install")
    print()

    print("[5/7] Creating configuration files...")
    env_path = pathlib.Path(app_dir) / ".env"
    if not env_path.exists():
        env_path.write_text("PTV_API_KEY=\n", encoding="utf-8")
        print(f"  Created {env_path} — add your PTV_API_KEY")
    else:
        print(f"  {env_path} already exists, keeping as-is")

    run(["chown", "-R", f"{args.service_user}:{args.service_user}", app_dir])
    print("  ✓ File ownership set")
    print()

    if not args.skip_ssl:
        print("[6/7] Generating self-signed TLS certificate...")
        certs_script = pathlib.Path(__file__).resolve().parent / "generate_certs.py"
        run([
            sys.executable, str(certs_script),
            "--hostname", args.domain,
            "--days", str(args.cert_days),
            "--install",
        ])
        print("  ✓ TLS certificate generated")
    else:
        print("[6/7] Skipping TLS certificate — HTTP only")
    print()

    print("[7/7] Configuring services...")
    node_path = shutil.which("node") or "/usr/bin/node"

    if not pathlib.Path(node_path).is_file():
        print(f"ERROR: node not found at {node_path}")
        sys.exit(1)

    server_js = pathlib.Path(app_dir) / "server.js"
    if not server_js.is_file():
        print(f"ERROR: {server_js} not found.")
        print(f"Make sure the project is at {app_dir} or use --app-dir.")
        sys.exit(1)

    if not (pathlib.Path(app_dir) / "node_modules").exists():
        print(f"ERROR: node_modules not found at {app_dir}/node_modules.")
        print(f"Run: cd {app_dir} && npm install")
        print("Then re-run this script, or: sudo systemctl restart ptv-tracker")
        sys.exit(1)

    write_systemd(args.service_user, app_dir, node_path)
    print("  ✓ systemd unit written")

    write_nginx(args.domain, args.port)
    print("  ✓ nginx config written")

    run(["nginx", "-t"])
    run(["systemctl", "reload", "nginx"])
    print("  ✓ nginx running")

    run(["systemctl", "daemon-reload"])
    run(["systemctl", "enable", "ptv-tracker"])
    run(["systemctl", "start", "ptv-tracker"])
    print("  ✓ ptv-tracker service started")

    if not args.skip_duckdns:
        if not args.duck_token:
            print("  DuckDNS token missing. Set DUCKDNS_TOKEN or pass --duck-token.")
        else:
            write_duckdns(args.domain, args.duck_token)
            run(["bash", "/etc/duckdns/duck.sh"], check=False)
            print("  ✓ DuckDNS cron set up")
    print()

    print("=" * 50)
    print("  Setup complete!")
    print()
    if args.app_dir:
        print(f"  App directory:    {app_dir}")
        print(f"  .env file:        {env_path}")
        print(f"  Service:          ptv-tracker.service")
        print(f"  Nginx config:     /etc/nginx/sites-available/ptv-tracker")
        if not args.skip_ssl:
            print(f"  TLS cert:         /etc/letsencrypt/live/{args.domain}/")
    else:
        print("  IMPORTANT: You didn't use --app-dir.")
        print("  The systemd unit points to the clone directory.")
        print("  For production, re-run with --app-dir /opt/ptv-tracker")
    print()
    if args.skip_ssl:
        print("  Access: http://<pi-ip>")
    else:
        print("  Access: https://<pi-ip>")
        print("  (Your browser will show a security warning — this is expected)")
    print("=" * 50)
