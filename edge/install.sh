#!/usr/bin/env bash
# Sunergy Edge Node — installer for Raspberry Pi (Debian/Raspberry Pi OS).
# Usage:
#   sudo ./install.sh

set -euo pipefail

APP_DIR=/opt/sunergy-edge
DATA_DIR=/var/lib/sunergy-edge
SVC_USER=sunergy
HERE=$(cd "$(dirname "$0")" && pwd)

if [ "$(id -u)" -ne 0 ]; then
  echo "run as root (sudo)"; exit 1
fi

echo "→ installing system deps"
apt-get update
apt-get install -y python3 python3-venv python3-pip

if ! id "$SVC_USER" >/dev/null 2>&1; then
  echo "→ creating service user '$SVC_USER'"
  useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin "$SVC_USER"
fi

echo "→ copying app to $APP_DIR"
mkdir -p "$APP_DIR" "$DATA_DIR"
cp -r "$HERE/sunergy_edge" "$APP_DIR/"
cp "$HERE/requirements.txt" "$APP_DIR/"
if [ ! -f "$APP_DIR/config.yaml" ]; then
  cp "$HERE/config.example.yaml" "$APP_DIR/config.yaml"
  echo "  ! edit $APP_DIR/config.yaml before starting the service"
fi
chown -R "$SVC_USER:$SVC_USER" "$APP_DIR" "$DATA_DIR"
chmod 600 "$APP_DIR/config.yaml"

echo "→ creating python venv"
sudo -u "$SVC_USER" python3 -m venv "$APP_DIR/venv"
sudo -u "$SVC_USER" "$APP_DIR/venv/bin/pip" install --upgrade pip
sudo -u "$SVC_USER" "$APP_DIR/venv/bin/pip" install -r "$APP_DIR/requirements.txt"

echo "→ installing systemd unit"
install -m 0644 "$HERE/sunergy-edge.service" /etc/systemd/system/sunergy-edge.service
systemctl daemon-reload
systemctl enable sunergy-edge.service

cat <<EOF

✓ install complete.

next steps:
  1. edit  /opt/sunergy-edge/config.yaml   (inverter IP, farm id, validator key)
  2. test  sudo -u $SVC_USER /opt/sunergy-edge/venv/bin/python -m sunergy_edge.main \\
              -c /opt/sunergy-edge/config.yaml --read-only
  3. start sudo systemctl start sunergy-edge
  4. logs  sudo journalctl -u sunergy-edge -f

EOF
