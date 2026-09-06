#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 027

REPOSITORY='Starlight-Unit-Studio/Quantum-Builder'
INSTALL_REF="${QB_INSTALL_REF:-main}"
TARGET_DIR='/opt/quantum-builder'
TEMP_DIR=''

log(){ printf '[Quantum Builder Setup] %s\n' "$*"; }
die(){ printf '[Quantum Builder Setup] FEHLER: %s\n' "$*" >&2; exit 1; }
cleanup(){
  if [[ -n "$TEMP_DIR" && -d "$TEMP_DIR" && "$TEMP_DIR" == /tmp/quantum-builder-setup.* ]]; then
    rm -rf -- "$TEMP_DIR"
  fi
}
trap cleanup EXIT

[[ "${EUID:-$(id -u)}" -eq 0 ]] || die 'Bitte das Setup mit sudo bash ausfuehren.'
[[ "$INSTALL_REF" =~ ^[A-Za-z0-9._/-]+$ && "$INSTALL_REF" != -* && "$INSTALL_REF" != *'..'* ]] || die 'Ungueltiger QB_INSTALL_REF.'

packages=()
command -v curl >/dev/null 2>&1 || packages+=(ca-certificates curl)
command -v git >/dev/null 2>&1 || packages+=(git)
command -v rsync >/dev/null 2>&1 || packages+=(rsync)
if (( ${#packages[@]} > 0 )); then
  command -v apt-get >/dev/null 2>&1 || die 'curl, git oder rsync fehlt und apt-get ist nicht verfuegbar.'
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y "${packages[@]}"
fi

if ! command -v docker >/dev/null 2>&1; then
  command -v apt-get >/dev/null 2>&1 || die 'Docker fehlt. Automatische Installation wird nur auf apt-basierten Systemen unterstuetzt.'
  log 'Docker fehlt, installiere Distribution-Paket.'
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y docker.io
  systemctl enable --now docker 2>/dev/null || service docker start 2>/dev/null || true
fi

if ! docker compose version >/dev/null 2>&1; then
  command -v apt-get >/dev/null 2>&1 || die 'Docker Compose v2 fehlt.'
  log 'Docker Compose v2 fehlt, installiere verfuegbares Compose-Paket.'
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  if ! apt-get install -y docker-compose-v2; then
    apt-get install -y docker-compose-plugin || die 'Docker Compose v2 konnte nicht installiert werden.'
  fi
fi

docker info >/dev/null 2>&1 || die 'Docker-Daemon ist nicht erreichbar.'

TEMP_DIR="$(mktemp -d /tmp/quantum-builder-setup.XXXXXX)"
log "Lade ${REPOSITORY} (${INSTALL_REF}) in ein temporaeres Verzeichnis."
git clone --depth 1 --branch "$INSTALL_REF" "https://github.com/${REPOSITORY}.git" "$TEMP_DIR/source"
SOURCE_DIR="$TEMP_DIR/source"

for required in VERSION compose.yaml README.md bin/bootstrap.php scripts/install.sh scripts/preflight.sh scripts/stack.sh scripts/host-proxy-info.sh public/index.php docker/worker/worker.py; do
  [[ -s "$SOURCE_DIR/$required" ]] || die "Quellpaket unvollstaendig: $required fehlt."
done

source_commit="$(git -C "$SOURCE_DIR" rev-parse HEAD)"
version="$(tr -d '[:space:]' < "$SOURCE_DIR/VERSION")"
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+[-A-Za-z0-9.]*$ ]] || die 'VERSION ist ungueltig.'
log "Checkout: ${source_commit} / Version ${version}"

existing=0
[[ -f "$TARGET_DIR/.env" ]] && existing=1
install -d -m 0750 "$TARGET_DIR"
if (( existing == 1 )); then
  log 'Bestehende Installation erkannt. App-Profile, Signing-Keys, Build-Historie und lokale Konfiguration bleiben erhalten.'
fi

# setup.sh runs with umask 027, so a fresh git clone is intentionally private
# (directories 0750, files 0640). Those clone modes must not be copied verbatim
# into the bind-mounted application source because the PHP and Nginx containers
# run as unprivileged users. Normalize only repository source paths here; .env
# and var/ stay excluded and retain their stricter persistent-state permissions.
rsync -a --delete --chmod=D755,F644 \
  --exclude='.git/' \
  --exclude='.env' \
  --exclude='var/' \
  "$SOURCE_DIR/" "$TARGET_DIR/"
chmod 0750 "$TARGET_DIR"
chmod 0750 "$TARGET_DIR/setup.sh"
find "$TARGET_DIR/scripts" -type f -name '*.sh' -exec chmod 0750 {} +

cd "$TARGET_DIR"
if (( existing == 1 )); then
  QB_SKIP_ADMIN_BOOTSTRAP=1 ./scripts/install.sh
else
  ./scripts/install.sh
fi

log "Quantum Builder ${version} wurde installiert/aktualisiert."
log "Source commit: ${source_commit}"
log 'Host-Webserver, KeyHelp-VHosts und TLS-Konfiguration werden vom Quantum-Installer nicht veraendert.'
