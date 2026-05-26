#!/bin/sh
# certbot DNS-01 auth/cleanup hook for DuckDNS
# Usage:
#   --manual-auth-hook   /opt/ptv-tracker/scripts/duckdns-hook.sh
#   --manual-cleanup-hook /opt/ptv-tracker/scripts/duckdns-hook.sh cleanup
#
# Reads DUCKDNS_TOKEN from /etc/duckdns/duck.sh

set -e

HOOK_FILE=/etc/duckdns/duck.sh
TOKEN=$(grep -o 'token=[^&]*' "$HOOK_FILE" | head -1 | cut -d= -f2)

if [ -z "$TOKEN" ]; then
    echo "Error: could not extract DuckDNS token from $HOOK_FILE" >&2
    exit 1
fi

DOMAIN=$(echo "$CERTBOT_DOMAIN" | sed 's/\.duckdns\.org$//')
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
