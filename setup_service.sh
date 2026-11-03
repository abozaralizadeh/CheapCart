#!/usr/bin/env bash
# Installs and updates CheapCart on a Debian or Ubuntu VM.
# Run it the first time and every time after: it installs what is needed, builds,
# (re)writes the systemd units and restarts the service. Run it with sudo:
#   sudo ./setup_service.sh
# Logs:   journalctl -u cheapcart.service -f
# Files:  logs/app.log (size limited), copy it to your computer when you need help with a fix.
#
# Settings (environment variables, all optional):
#   PORT=3000          port the app listens on
#   DOMAIN=            set it to also write an nginx site for that domain (no HTTPS is set up for you)
#   APP_USER=          user that runs the service (default: the user who ran sudo)
set -euo pipefail

if [ "${EUID:-$(id -u)}" -ne 0 ]; then
  echo "Run this with sudo: sudo ./setup_service.sh" >&2
  exit 1
fi

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_USER="${APP_USER:-${SUDO_USER:-root}}"
PORT="${PORT:-3000}"
DOMAIN="${DOMAIN:-}"
SERVICE="cheapcart"
BACKUP_DIR="/var/backups/cheapcart"

say() { printf '\n==> %s\n' "$*"; }
as_user() { sudo -u "$APP_USER" -H bash -lc "cd '$APP_DIR' && $*"; }

say "Checking system packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl ca-certificates tar
if ! command -v node >/dev/null 2>&1; then
  apt-get install -y nodejs npm
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Node $(node -v) is too old. CheapCart needs Node 20.9 or newer." >&2
  echo "Install a newer Node (for example from nodejs.org or your own package source), then run this again." >&2
  exit 1
fi

if [ ! -f "$APP_DIR/.env" ]; then
  say "Creating .env from .env.example (edit it, then run this script again)"
  cp "$APP_DIR/.env.example" "$APP_DIR/.env"
  chown "$APP_USER":"$APP_USER" "$APP_DIR/.env"
fi

say "Installing dependencies and building"
as_user "npm ci"
as_user "npm run build"
mkdir -p "$APP_DIR/logs"
chown -R "$APP_USER":"$APP_USER" "$APP_DIR/logs"

say "Writing the systemd service"
cat > "/etc/systemd/system/$SERVICE.service" <<UNIT
[Unit]
Description=CheapCart (working name)
After=network.target

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=-$APP_DIR/.env
Environment=NODE_ENV=production
ExecStart=$(command -v npm) run start -- -p $PORT
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT

say "Writing the daily freshness check and backup"
cat > "/etc/systemd/system/$SERVICE-freshness.service" <<UNIT
[Unit]
Description=CheapCart price freshness check (fails when most prices are stale)

[Service]
Type=oneshot
User=$APP_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=-$APP_DIR/.env
ExecStart=$(command -v npm) run report:freshness
UNIT
cat > "/etc/systemd/system/$SERVICE-freshness.timer" <<UNIT
[Unit]
Description=Daily CheapCart freshness check

[Timer]
OnCalendar=daily
Persistent=true

[Install]
WantedBy=timers.target
UNIT
mkdir -p "$BACKUP_DIR"
cat > "/etc/systemd/system/$SERVICE-backup.service" <<UNIT
[Unit]
Description=CheapCart backup

[Service]
Type=oneshot
ExecStart=$APP_DIR/scripts/backup.sh $APP_DIR $BACKUP_DIR
UNIT
cat > "/etc/systemd/system/$SERVICE-backup.timer" <<UNIT
[Unit]
Description=Daily CheapCart backup

[Timer]
OnCalendar=*-*-* 03:30:00
Persistent=true

[Install]
WantedBy=timers.target
UNIT

if [ -n "$DOMAIN" ]; then
  say "Writing an nginx site for $DOMAIN"
  apt-get install -y nginx
  cat > "/etc/nginx/sites-available/$SERVICE" <<NGINX
server {
    listen 80;
    server_name $DOMAIN;
    client_max_body_size 3m;
    location / {
        proxy_pass http://127.0.0.1:$PORT;
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

sleep 4
if systemctl is-active --quiet "$SERVICE.service"; then
  echo "CheapCart is running on port $PORT."
else
  echo "The service did not start. Look at: journalctl -u $SERVICE.service -n 50" >&2
  exit 1
fi
echo "Logs: journalctl -u $SERVICE.service -f"
echo "File log: $APP_DIR/logs/app.log"
