#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"

log(){ printf '[Quantum Builder Host] %s\n' "$*"; }

read_env(){
  local key="$1"
  local fallback="${2:-}"
  local value=''
  if [[ -f "$ENV_FILE" ]]; then
    value="$(grep -E "^${key}=" "$ENV_FILE" | tail -n1 | cut -d= -f2- || true)"
  fi
  printf '%s' "${value:-$fallback}"
}

bind="$(read_env QB_BIND 127.0.0.1)"
port="$(read_env QB_HTTP_PORT 8787)"
domain="$(read_env QB_PUBLIC_DOMAIN '')"
client_host="$bind"
[[ "$client_host" == '0.0.0.0' ]] && client_host='127.0.0.1'
internal_url="http://${client_host}:${port}"

keyhelp=0
for marker in /etc/keyhelp /usr/local/keyhelp /opt/keyhelp; do
  if [[ -e "$marker" ]]; then
    keyhelp=1
    break
  fi
done
if (( keyhelp == 0 )) && [[ -d /etc/apache2 ]]; then
  if grep -RIlm1 'keyhelp' /etc/apache2 2>/dev/null | grep -q .; then
    keyhelp=1
  fi
fi

apache=0
nginx=0
(command -v apache2ctl >/dev/null 2>&1 || command -v httpd >/dev/null 2>&1) && apache=1
command -v nginx >/dev/null 2>&1 && nginx=1

log "Interner Quantum-Endpunkt: ${internal_url}"
if [[ -n "$domain" ]]; then
  log "Oeffentliche Domain: https://${domain}"
else
  log 'Keine oeffentliche Domain in QB_PUBLIC_DOMAIN hinterlegt.'
fi

if (( keyhelp == 1 )); then
  log 'KeyHelp-Marker erkannt. Host-Webserver, VHost und TLS bleiben vollstaendig unter KeyHelp-Verwaltung.'
fi
if (( apache == 1 )); then
  log 'Apache auf dem Host erkannt.'
fi
if (( nginx == 1 )); then
  log 'Nginx auf dem Host erkannt.'
fi
if (( apache == 0 && nginx == 0 )); then
  log 'Kein Apache/Nginx-Binary auf dem Host erkannt. Quantum selbst bleibt trotzdem lokal ueber seinen Docker-Nginx erreichbar.'
fi

cat <<EOF

Quantum Builder veraendert absichtlich KEINE Host-Webserver-, KeyHelp- oder TLS-Konfiguration.
Der Docker-Nginx bleibt auf ${bind}:${port} gebunden und soll hinter dem vorhandenen HTTPS-VHost betrieben werden.
EOF

if [[ -n "$domain" ]]; then
  cat <<EOF

Zieltopologie:
  https://${domain}
      -> KeyHelp/Host-Webserver + TLS
      -> ${internal_url}
      -> Quantum Docker Nginx
      -> PHP-FPM

Apache Reverse-Proxy-Direktiven fuer den verwalteten VHost:
  ProxyPreserveHost On
  ProxyPass        / ${internal_url}/
  ProxyPassReverse / ${internal_url}/

Nginx Reverse-Proxy-Block fuer einen verwalteten server{}-VHost:
  location / {
      proxy_set_header Host \\$host;
      proxy_set_header X-Real-IP \\$remote_addr;
      proxy_set_header X-Forwarded-For \\$proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto \\$scheme;
      proxy_pass ${internal_url};
  }

Bei KeyHelp diese Regeln nur ueber die von KeyHelp vorgesehene VHost-/Domain-Erweiterung eintragen.
Keine von KeyHelp generierte Apache-Konfiguration manuell ersetzen.
EOF
fi
