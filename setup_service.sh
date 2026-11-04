#!/usr/bin/env bash
# Installs and updates CheapCart on a Linux VM. Run it from the project folder, the first time and
# every time after: it pulls your changes, builds, (re)writes the systemd units and restarts the service.
#
# On its own VM (Debian or Ubuntu, installs what is missing):
#
#   sudo ./setup_service.sh
#   sudo DOMAIN=cheapcart.example.com ./setup_service.sh    also writes an nginx site for that domain
#
# On a VM shared with other apps, behind an nginx you already run, under a path (installs nothing):
#
#   sudo SERVICE_NAME=idea-cheapcart PORT=8604 BASE_PATH=/cheapcart/ \
#        NGINX_SNIPPET=/etc/nginx/max.d/cheapcart.conf ./setup_service.sh
#
#   This mode runs no apt-get and touches no firewall, certificate or nginx site. It checks that node,
#   npm, nginx and curl are already there and stops if one is missing. It writes exactly two nginx
#   files, the snippet and /etc/nginx/conf.d/<service>-limits.conf, runs nginx -t, and puts both back
#   as they were if the check fails. Your server block must include the snippet folder
#   (for example: include /etc/nginx/max.d/*.conf;). The app listens on 127.0.0.1 only.
#
# Logs:   journalctl -u <service> -f   (default service name: cheapcart)
# Files:  logs/app.log (size limited), copy it to your computer when you need help with a fix.
#
# Settings (environment variables, all optional):
#   PORT=3000          port the app listens on (kept in .env)
#   BASE_PATH=         serve the app under a path such as /cheapcart/ (kept in .env, needs a rebuild)
#   SERVICE_NAME=      systemd service name (default cheapcart)
#   NGINX_SNIPPET=     switches on the shared VM mode, see above
#   DOMAIN=            standalone only: also write an nginx site for that domain (no HTTPS is set up for you)
#   APP_USER=          user that runs the service (default: whoever owns the project folder)
#   GIT_PULL=false     skip the git pull at the start
set -euo pipefail

if [ "${EUID:-$(id -u)}" -ne 0 ]; then
  echo "Run this with sudo: sudo ./setup_service.sh" >&2
  exit 1
fi

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"
APP_USER="${APP_USER:-$(stat -c %U "$APP_DIR")}"
APP_GROUP="$(id -gn "$APP_USER")"
SERVICE="${SERVICE_NAME:-cheapcart}"
DOMAIN="${DOMAIN:-}"
SHARED=false
[ -n "${NGINX_SNIPPET:-}" ] && SHARED=true
BACKUP_DIR="/var/backups/$SERVICE"

say() { printf '\n==> %s\n' "$*"; }
as_user() { sudo -u "$APP_USER" -H env PATH="$PATH" bash -c "cd '$APP_DIR' && $*"; }

if [ -d .git ] && [ "${GIT_PULL:-true}" = true ]; then
  say "Latest code"
  # Fast forward only, so local changes are never thrown away.
  as_user "git pull --ff-only" || echo "    could not fast forward, building what is here"
fi

if $SHARED; then
  say "Shared VM mode: checking what is already installed (nothing gets installed or changed)"
  missing=""
  for tool in node npm nginx curl tar systemctl; do
    command -v "$tool" >/dev/null 2>&1 || missing="$missing $tool"
  done
  if [ -n "$missing" ]; then
    echo "Missing on this VM:$missing" >&2
    echo "Shared VM mode never installs system packages. Install them yourself, then run this again." >&2
    exit 1
  fi
else
  say "Checking system packages"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y curl ca-certificates tar
  if ! command -v node >/dev/null 2>&1; then
    apt-get install -y nodejs npm
  fi
fi

if ! node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>20||(a===20&&b>=9)?0:1)'; then
  echo "Node $(node -v) is too old. CheapCart needs Node 20.9 or newer." >&2
  echo "Install a newer Node (for example from nodejs.org or your own package source), then run this again." >&2
  exit 1
fi
echo "    node $(node -v)"

say "Settings"
if [ ! -f .env ]; then
  cp .env.example .env
  echo "    created .env from .env.example (edit it, then run this script again)"
fi
chown "$APP_USER:$APP_GROUP" .env
chmod 600 .env
set_env() { # set_env KEY VALUE (adds or replaces the line, keeps everything else)
  if grep -q "^$1=" .env; then sed -i "s|^$1=.*|$1=$2|" .env; else printf '%s=%s\n' "$1" "$2" >> .env; fi
}
get_env() { grep -E "^$1=" .env | tail -n 1 | cut -d= -f2- || true; }

[ -n "${PORT:-}" ] && set_env PORT "$PORT"
[ -n "${BASE_PATH:-}" ] && set_env BASE_PATH "$BASE_PATH"
if $SHARED; then
  [ -n "$(get_env BASE_PATH)" ] || set_env BASE_PATH /cheapcart/
  # The app listens on 127.0.0.1 only, so the one proxy that can reach it is nginx on this machine.
  set_env TRUST_PROXY 127.0.0.1
elif [ -n "$DOMAIN" ]; then
  set_env TRUST_PROXY 127.0.0.1
fi
APP_PORT="$(get_env PORT)"; APP_PORT="${APP_PORT:-3000}"
BASE="$(get_env BASE_PATH)"
if [ -n "$BASE" ] && [[ "$BASE" != /*/ ]]; then
  echo "BASE_PATH must start and end with a slash, like /cheapcart/ (it is '$BASE')." >&2
  exit 1
fi
if $SHARED || [ -n "$DOMAIN" ]; then HOST=127.0.0.1; else HOST=0.0.0.0; fi
echo "    port $APP_PORT, path ${BASE:-/}, listening on $HOST"

say "Installing dependencies and building"
as_user "npm ci"
# Next reads .env, so the build picks up BASE_PATH from there.
as_user "npm run build"
mkdir -p logs data/runtime
chown -R "$APP_USER:$APP_GROUP" logs data

say "Writing the systemd service"
NPM_BIN="$(command -v npm)"
cat > "/etc/systemd/system/$SERVICE.service" <<UNIT
[Unit]
Description=CheapCart ($SERVICE)
After=network.target

[Service]
Type=simple
User=$APP_USER
Group=$APP_GROUP
WorkingDirectory=$APP_DIR
EnvironmentFile=-$APP_DIR/.env
Environment=NODE_ENV=production
Environment=PATH=$(dirname "$(command -v node)"):/usr/local/bin:/usr/bin:/bin
ExecStart=$NPM_BIN run start -- -H $HOST -p $APP_PORT
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full

[Install]
WantedBy=multi-user.target
UNIT

say "Writing the daily freshness check and backup"
cat > "/etc/systemd/system/$SERVICE-freshness.service" <<UNIT
[Unit]
Description=CheapCart price freshness check for $SERVICE (fails when most prices are stale)

[Service]
Type=oneshot
User=$APP_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=-$APP_DIR/.env
Environment=PATH=$(dirname "$(command -v node)"):/usr/local/bin:/usr/bin:/bin
ExecStart=$NPM_BIN run report:freshness
UNIT
cat > "/etc/systemd/system/$SERVICE-freshness.timer" <<UNIT
[Unit]
Description=Daily CheapCart freshness check for $SERVICE

[Timer]
OnCalendar=daily
Persistent=true

[Install]
WantedBy=timers.target
UNIT
mkdir -p "$BACKUP_DIR"
cat > "/etc/systemd/system/$SERVICE-backup.service" <<UNIT
[Unit]
Description=CheapCart backup for $SERVICE

[Service]
Type=oneshot
ExecStart=$APP_DIR/scripts/backup.sh $APP_DIR $BACKUP_DIR
UNIT
cat > "/etc/systemd/system/$SERVICE-backup.timer" <<UNIT
[Unit]
Description=Daily CheapCart backup for $SERVICE

[Timer]
OnCalendar=*-*-* 03:30:00
Persistent=true

[Install]
WantedBy=timers.target
UNIT

if $SHARED; then
  ZONE="${SERVICE//-/_}"
  ZONE_FILE="/etc/nginx/conf.d/${SERVICE}-limits.conf"
  say "nginx: ${BASE} -> 127.0.0.1:${APP_PORT}"
  grep -qE 'include\s+/etc/nginx/conf\.d/\*\.conf' /etc/nginx/nginx.conf || {
    echo "nginx.conf does not include conf.d, so the rate limit zone can't be added. Nothing in nginx changed." >&2
    exit 1
  }
  mkdir -p "$(dirname "$NGINX_SNIPPET")"
  had_snippet=false; had_zone=false
  [ -f "$NGINX_SNIPPET" ] && { cp "$NGINX_SNIPPET" "$NGINX_SNIPPET.bak"; had_snippet=true; }
  [ -f "$ZONE_FILE" ] && { cp "$ZONE_FILE" "$ZONE_FILE.bak"; had_zone=true; }
  cat > "$ZONE_FILE" <<NGINX
# ${SERVICE}: rate limit zone, used by ${NGINX_SNIPPET}
limit_req_zone \$binary_remote_addr zone=${ZONE}:10m rate=10r/s;
NGINX
  # No path on proxy_pass: the app is built with BASE_PATH, so it expects the ${BASE} prefix.
  cat > "$NGINX_SNIPPET" <<NGINX
# ${SERVICE}: written by setup_service.sh in ${APP_DIR}
location = ${BASE%/} { return 301 ${BASE}; }
location ${BASE} {
    limit_req zone=${ZONE} burst=40 nodelay;
    limit_req_status 429;
    client_max_body_size 3m;
    proxy_pass http://127.0.0.1:${APP_PORT};
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-For \$remote_addr;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header Connection "";
    proxy_connect_timeout 5s;
    proxy_read_timeout 30s;
}
NGINX
  if nginx -t 2>"/tmp/${SERVICE}-nginx-test.log"; then
    rm -f "$NGINX_SNIPPET.bak" "$ZONE_FILE.bak"
    systemctl reload nginx
  else
    cat "/tmp/${SERVICE}-nginx-test.log" >&2
    if $had_snippet; then mv "$NGINX_SNIPPET.bak" "$NGINX_SNIPPET"; else rm -f "$NGINX_SNIPPET"; fi
    if $had_zone; then mv "$ZONE_FILE.bak" "$ZONE_FILE"; else rm -f "$ZONE_FILE"; fi
    echo "nginx -t failed, so the nginx files were put back as they were." >&2
    exit 1
  fi
elif [ -n "$DOMAIN" ]; then
  say "Writing an nginx site for $DOMAIN"
  apt-get install -y nginx
  cat > "/etc/nginx/sites-available/$SERVICE" <<NGINX
server {
    listen 80;
    server_name $DOMAIN;
    client_max_body_size 3m;
    location / {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINX
  ln -sf "/etc/nginx/sites-available/$SERVICE" "/etc/nginx/sites-enabled/$SERVICE"
  nginx -t && systemctl reload nginx
  echo "HTTPS is not set up. When the domain points at this VM, run: sudo apt-get install -y certbot python3-certbot-nginx && sudo certbot --nginx -d $DOMAIN"
fi

say "Starting everything"
systemctl daemon-reload
systemctl enable "$SERVICE.service" "$SERVICE-freshness.timer" "$SERVICE-backup.timer"
systemctl restart "$SERVICE.service"
systemctl restart "$SERVICE-freshness.timer" "$SERVICE-backup.timer"

HEALTH="http://127.0.0.1:${APP_PORT}${BASE%/}/api/health"
for _ in $(seq 1 30); do
  if curl -fsS "$HEALTH" >/dev/null 2>&1; then
    echo "CheapCart is up on 127.0.0.1:${APP_PORT}${BASE%/}/ ($SERVICE)."
    echo "Logs: journalctl -u $SERVICE -f"
    echo "File log: $APP_DIR/logs/app.log"
    exit 0
  fi
  sleep 1
done
echo "The service did not come up. Look at: journalctl -u $SERVICE -n 50" >&2
exit 1
