#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

usage(){
  cat <<'EOF'
Usage: sudo ./scripts/stack.sh <command>

Commands:
  status      Show container state
  logs        Follow all logs
  up          Start/update containers
  stop        Stop containers
  restart     Restart containers
  rebuild     Rebuild images and restart
  preflight   Run installation checks
  hosting     Show host webserver / reverse-proxy status
EOF
}

cmd="${1:-}"
case "$cmd" in
  status) docker compose ps ;;
  logs) docker compose logs -f --tail=200 ;;
  up) docker compose up -d --remove-orphans ;;
  stop) docker compose stop ;;
  restart) docker compose restart ;;
  rebuild) docker compose build --pull && docker compose up -d --remove-orphans ;;
  preflight) exec "$ROOT_DIR/scripts/preflight.sh" ;;
  hosting) exec "$ROOT_DIR/scripts/hosting.sh" status ;;
  *) usage; exit 2 ;;
esac
