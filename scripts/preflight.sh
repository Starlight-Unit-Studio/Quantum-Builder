#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

log(){ printf '[Quantum Builder Preflight] %s\n' "$*"; }
die(){ printf '[Quantum Builder Preflight] FEHLER: %s\n' "$*" >&2; exit 1; }

[[ -f .env ]] || die '.env fehlt.'
command -v docker >/dev/null 2>&1 || die 'Docker fehlt.'
docker compose version >/dev/null 2>&1 || die 'Docker Compose v2 fehlt.'

docker compose config -q
log 'Compose-Konfiguration OK.'

for service in php nginx worker; do
  cid="$(docker compose ps -q "$service")"
  [[ -n "$cid" ]] || die "Service $service ist nicht gestartet."
  running="$(docker inspect -f '{{.State.Running}}' "$cid")"
  [[ "$running" == true ]] || die "Service $service laeuft nicht."
  log "$service laeuft."
done

bind="$(grep '^QB_BIND=' .env | tail -n1 | cut -d= -f2-)"
port="$(grep '^QB_HTTP_PORT=' .env | tail -n1 | cut -d= -f2-)"
bind="${bind:-127.0.0.1}"
port="${port:-8787}"

health_url="http://${bind}:${port}/health.php"
# 0.0.0.0 ist ein Bind-Ziel, kein sinnvoller Client-Host.
[[ "$bind" == '0.0.0.0' ]] && health_url="http://127.0.0.1:${port}/health.php"

response="$(curl -fsS --max-time 10 "$health_url")" || die "Healthcheck nicht erreichbar: $health_url"
printf '%s' "$response" | grep -q '"ok":true' || die "Healthcheck meldet keinen gesunden Zustand: $response"
log "HTTP Healthcheck OK: $health_url"

worker_python="$(docker compose exec -T worker python3 --version 2>&1)"
[[ "$worker_python" == Python* ]] || die 'Build-Worker Python fehlt.'
docker compose exec -T worker sh -lc 'command -v java >/dev/null && command -v sdkmanager >/dev/null && test -d "$ANDROID_HOME/platforms/android-36"' \
  || die 'Android SDK/JDK im Build-Worker unvollstaendig.'
log 'Android 36 Toolchain im Worker OK.'

version="$(tr -d '[:space:]' < VERSION)"
printf '%s' "$response" | grep -q "\"version\":\"$version\"" || die 'Runtime-Version stimmt nicht mit VERSION ueberein.'
log "Version $version konsistent."
