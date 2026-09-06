#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

log(){ printf '[Quantum Builder Hosting] %s\n' "$*"; }
die(){ printf '[Quantum Builder Hosting] FEHLER: %s\n' "$*" >&2; exit 1; }

[[ -f .env ]] || die '.env fehlt.'

env_value(){
  local key="$1"
  grep -E "^${key}=" .env | tail -n1 | cut -d= -f2- || true
}

bind="$(env_value QB_BIND)"
port="$(env_value QB_HTTP_PORT)"
public_url="$(env_value QB_PUBLIC_URL)"
bind="${bind:-127.0.0.1}"
port="${port:-8787}"
public_url="${public_url:-https://builder.starlight-unit.de}"

target_host="$bind"
case "$target_host" in
  0.0.0.0|::|'[::]') target_host='127.0.0.1' ;;
esac
proxy_target="http://${target_host}:${port}"

keyhelp=0
[[ -d /etc/apache2/keyhelp ]] && keyhelp=1

apache=0
if command -v apache2ctl >/dev/null 2>&1 || command -v apachectl >/dev/null 2>&1 || command -v httpd >/dev/null 2>&1; then
  apache=1
fi

nginx=0
command -v nginx >/dev/null 2>&1 && nginx=1

usage(){
  cat <<'EOF'
Usage: sudo ./scripts/hosting.sh <command>

Commands:
  status          Detect managed hosting / host webserver and show proxy target
  keyhelp         Print KeyHelp Apache HTTPS directives
  apache          Print generic Apache reverse-proxy directives
  nginx           Print generic Nginx reverse-proxy location block
EOF
}

print_apache_snippet(){
  cat <<EOF
<IfModule mod_proxy.c>
    ProxyPreserveHost On
    ProxyPass /.well-known/acme-challenge !
    ProxyPass / ${proxy_target}/
    ProxyPassReverse / ${proxy_target}/
</IfModule>

<IfModule mod_headers.c>
    RequestHeader set X-Forwarded-Proto "https"
    RequestHeader set X-Forwarded-Port "443"
</IfModule>
EOF
}

print_nginx_snippet(){
  cat <<EOF
location / {
    proxy_pass ${proxy_target};
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header X-Forwarded-Host \$host;
}
EOF
}

cmd="${1:-status}"
case "$cmd" in
  status)
    log "Public URL: ${public_url}"
    log "Internal endpoint: http://${bind}:${port}"
    log "Reverse-proxy target: ${proxy_target}"

    if [[ "$bind" != '127.0.0.1' && "$bind" != '::1' && "$bind" != '[::1]' ]]; then
      log "WARNUNG: QB_BIND=${bind} ist nicht loopback-only. Fuer KeyHelp/Reverse-Proxy-Betrieb wird 127.0.0.1 empfohlen."
    fi

    if (( keyhelp == 1 )); then
      log 'KeyHelp-Konfiguration erkannt (/etc/apache2/keyhelp).'
      log 'Quantum Builder veraendert keine von KeyHelp verwalteten VHost-Dateien.'
      log 'KeyHelp: Domains -> builder.starlight-unit.de -> Apache-Einstellungen -> HTTPS-Anweisungen.'
      log 'Snippet anzeigen: sudo ./scripts/hosting.sh keyhelp'
    elif (( apache == 1 )); then
      log 'Apache auf dem Host erkannt. Quantum bleibt hinter dem bestehenden Host-Webserver.'
      log 'Snippet anzeigen: sudo ./scripts/hosting.sh apache'
    elif (( nginx == 1 )); then
      log 'Nginx auf dem Host erkannt. Quantum bleibt hinter dem bestehenden Host-Webserver.'
      log 'Snippet anzeigen: sudo ./scripts/hosting.sh nginx'
    else
      log 'Kein Host-Webserver erkannt. Quantum Builder bleibt lokal erreichbar; fuer oeffentlichen Zugriff ist ein HTTPS-Reverse-Proxy erforderlich.'
    fi
    ;;
  keyhelp)
    log "KeyHelp HTTPS reverse proxy for ${public_url} -> ${proxy_target}"
    log 'Die folgenden Direktiven im KeyHelp-Domainfeld fuer HTTPS eintragen:'
    printf '\n'
    print_apache_snippet
    printf '\n'
    log 'Benoetigte Apache-Module: proxy, proxy_http, headers.'
    log 'KeyHelp-VHost-Dateien nicht manuell bearbeiten; KeyHelp kann diese neu generieren.'
    ;;
  apache)
    print_apache_snippet
    ;;
  nginx)
    print_nginx_snippet
    ;;
  *)
    usage
    exit 2
    ;;
esac
