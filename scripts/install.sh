#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 027

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

log(){ printf '[Quantum Builder Install] %s\n' "$*"; }
die(){ printf '[Quantum Builder Install] FEHLER: %s\n' "$*" >&2; exit 1; }

[[ "${EUID:-$(id -u)}" -eq 0 ]] || die 'Bitte mit sudo/root ausfuehren.'
command -v docker >/dev/null 2>&1 || die 'Docker ist nicht installiert.'
docker compose version >/dev/null 2>&1 || die 'Docker Compose v2 ist nicht verfuegbar.'

install -d -m 0770 var

if [[ ! -f .env ]]; then
  secret="$(od -An -N48 -tx1 /dev/urandom | tr -d ' \n')"
  cat > .env <<EOF
QB_BIND=${QB_BIND:-127.0.0.1}
QB_HTTP_PORT=${QB_HTTP_PORT:-8787}
QB_VERSION=$(tr -d '[:space:]' < VERSION)
QB_SESSION_SECRET=${secret}
QB_WRAPPER_REPOSITORY=${QB_WRAPPER_REPOSITORY:-https://github.com/Starlight-Unit-Studio/Quantum-Mobile-Wrapper.git}
QB_WRAPPER_REF=${QB_WRAPPER_REF:-compat/android-6-api23}
QB_POLL_SECONDS=3
EOF
  chmod 0600 .env
  log 'Neue lokale Konfiguration erzeugt.'
else
  log 'Bestehende lokale Konfiguration bleibt erhalten.'
fi

# PHP Alpine nutzt www-data UID 82. Der Worker darf als root im Build-Container
# denselben persistenten Store verwenden. Keine weltweiten Schreibrechte.
chown -R 82:82 var
chmod -R u+rwX,g+rwX,o-rwx var

auto_email="${QB_ADMIN_EMAIL:-}"
auto_password="${QB_ADMIN_PASSWORD:-}"
if [[ -z "$auto_email" && -r /dev/tty && -w /dev/tty ]]; then
  printf 'Admin E-Mail: ' >/dev/tty
  IFS= read -r auto_email </dev/tty
fi
if [[ -z "$auto_password" && -r /dev/tty && -w /dev/tty ]]; then
  while :; do
    printf 'Admin Passwort (mindestens 12 Zeichen): ' >/dev/tty
    IFS= read -r -s auto_password </dev/tty
    printf '\n' >/dev/tty
    [[ ${#auto_password} -ge 12 ]] && break
    printf 'Passwort ist zu kurz.\n' >/dev/tty
  done
fi

log 'Baue Web-Runtime und Android-Build-Worker. Der erste Worker-Build kann einige Minuten dauern.'
docker compose build --pull

if [[ -n "$auto_email" || -n "$auto_password" ]]; then
  [[ -n "$auto_email" && -n "$auto_password" ]] || die 'QB_ADMIN_EMAIL und QB_ADMIN_PASSWORD muessen gemeinsam gesetzt sein.'
  log 'Initialisiere Administrator.'
  docker compose run --rm \
    -e QB_BOOTSTRAP_ADMIN_EMAIL="$auto_email" \
    -e QB_BOOTSTRAP_ADMIN_PASSWORD="$auto_password" \
    php php /app/bin/bootstrap.php
fi
unset auto_password QB_ADMIN_PASSWORD || true

log 'Starte Quantum Builder.'
docker compose up -d --remove-orphans

"$ROOT_DIR/scripts/preflight.sh"
log "Quantum Builder $(tr -d '[:space:]' < VERSION) ist bereit."
log "Lokaler Endpunkt: http://$(grep '^QB_BIND=' .env | cut -d= -f2):$(grep '^QB_HTTP_PORT=' .env | cut -d= -f2)"
