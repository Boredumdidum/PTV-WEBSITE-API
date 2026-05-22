#!/usr/bin/env python3
import argparse
import os
import pathlib
import shutil
import socket
import subprocess
import sys
import textwrap


def run(cmd, check=True):
    print("+", " ".join(cmd))
    subprocess.run(cmd, check=check)


def write_file(path, content, mode=None):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
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


def write_duckdns_creds(token):
    write_file(
        pathlib.Path("/etc/letsencrypt/duckdns.ini"),
        f"dns_duckdns_token = {token}\n",
        mode=0o600,
    )


def setup_certbot_venv():
    venv_path = pathlib.Path("/opt/ptv-tracker-venv")
    if not (venv_path / "bin" / "certbot").exists():
        run(["python3", "-m", "venv", str(venv_path)])
        run([str(venv_path / "bin" / "pip"), "install", "certbot", "certbot-dns-duckdns"])
    return str(venv_path / "bin" / "certbot")


def resolve_domain(domain):
    try:
        socket.getaddrinfo(domain, None)
    except socket.gaierror:
        print(f"ERROR: Domain {domain} does not resolve via DNS.")
        print("Make sure you've registered this domain at https://duckdns.org")
        print("and that it has not expired.")
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="Setup Raspberry Pi for PTV GTFS-RT web app")
    parser.add_argument("--domain", default="ptv-tracker.duckdns.org")
    parser.add_argument("--email", required=True)
    parser.add_argument("--app-dir")
    parser.add_argument("--service-user", default="ptvtracker")
    parser.add_argument("--port", default="3000")
    parser.add_argument("--duck-token", default=os.environ.get("DUCKDNS_TOKEN"))
    parser.add_argument("--certbot-propagation-seconds", type=int, default=120)
    parser.add_argument("--skip-certbot", action="store_true")
    parser.add_argument("--skip-node", action="store_true")
    parser.add_argument("--skip-npm", action="store_true")
    parser.add_argument("--skip-duckdns", action="store_true")
    args = parser.parse_args()

    ensure_root()

    run(["apt-get", "update"])
    run(["apt-get", "install", "-y", "nginx", "git", "curl", "ca-certificates",
         "python3-venv", "python3-pip"])

    if not args.skip_node:
        install_node()

    if args.app_dir:
        app_dir = os.path.abspath(args.app_dir)
    else:
        app_dir = os.path.abspath(pathlib.Path(__file__).resolve().parent.parent)

    pathlib.Path(app_dir).mkdir(parents=True, exist_ok=True)

    ensure_user(args.service_user, app_dir)
    ensure_service_access(app_dir)
    run(["chown", "-R", f"{args.service_user}:{args.service_user}", app_dir])

    if not args.skip_npm:
        run(["bash", "-c", f"cd {app_dir} && npm install"])

    env_path = pathlib.Path(app_dir) / ".env"
    if not env_path.exists():
        env_path.write_text("PTV_API_KEY=\n", encoding="utf-8")
        print(f"Created {env_path}. Add your PTV_API_KEY before starting the service.")

    node_path = shutil.which("node") or "/usr/bin/node"
    write_systemd(args.service_user, app_dir, node_path)

    run(["systemctl", "daemon-reload"])
    run(["systemctl", "enable", "ptv-tracker"])

    if not args.skip_duckdns:
        if not args.duck_token:
            print("DuckDNS token missing. Set DUCKDNS_TOKEN or pass --duck-token.")
        else:
            write_duckdns(args.domain, args.duck_token)
            write_duckdns_creds(args.duck_token)
            run(["bash", "/etc/duckdns/duck.sh"], check=False)

    if not args.skip_certbot:
        if not args.duck_token:
            print("ERROR: DuckDNS token required for certbot DNS-01 challenge.")
            print("Set DUCKDNS_TOKEN or pass --duck-token.")
            sys.exit(1)

        resolve_domain(args.domain)

        certbot_bin = setup_certbot_venv()

        write_duckdns_creds(args.duck_token)

        run([
            certbot_bin, "certonly",
            "--authenticator", "dns-duckdns",
            "--dns-duckdns-credentials", "/etc/letsencrypt/duckdns.ini",
            "--dns-duckdns-propagation-seconds", str(args.certbot_propagation_seconds),
            "-d", args.domain,
            "--agree-tos", "--email", args.email,
            "--non-interactive",
        ])

    write_nginx(args.domain, args.port)
    run(["nginx", "-t"])
    run(["systemctl", "reload", "nginx"])

    run(["systemctl", "start", "ptv-tracker"])

    print("Setup complete.")


if __name__ == "__main__":
    main()
