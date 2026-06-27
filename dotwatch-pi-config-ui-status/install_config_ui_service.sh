#!/usr/bin/env bash

set -e

PROJECT_DIR="${1:-/home/pi/dotwatch-pi-agent}"
SERVICE_FILE="/etc/systemd/system/dotwatch-pi-config-ui.service"
CURRENT_USER="$(whoami)"

echo "Installing dotWatch Pi Config UI..."
echo "Project directory: ${PROJECT_DIR}"
echo "User: ${CURRENT_USER}"

mkdir -p "${PROJECT_DIR}"

if [ ! -f "${PROJECT_DIR}/pi_config_web.py" ]; then
  echo "pi_config_web.py not found in ${PROJECT_DIR}"
  echo "Please copy pi_config_web.py to ${PROJECT_DIR} first."
  exit 1
fi

chmod +x "${PROJECT_DIR}/pi_config_web.py"

if [ ! -f "${PROJECT_DIR}/.env" ]; then
  cat > "${PROJECT_DIR}/.env" <<'EOF'
DOTWATCH_API_URL=https://dotwatch-backend.onrender.com
DEVICE_CODE=
DEVICE_SECRET=
SEND_INTERVAL_SECONDS=5
FIRMWARE_VERSION=rpi-agent-0.1.0
CONFIG_UI_USERNAME=admin
CONFIG_UI_PASSWORD=change-this-config-password
EOF
fi

if ! grep -q "^CONFIG_UI_USERNAME=" "${PROJECT_DIR}/.env"; then
  cat >> "${PROJECT_DIR}/.env" <<'EOF'

CONFIG_UI_USERNAME=admin
CONFIG_UI_PASSWORD=change-this-config-password
EOF
fi

sudo tee "${SERVICE_FILE}" > /dev/null <<EOF
[Unit]
Description=dotWatch Raspberry Pi Config UI
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${PROJECT_DIR}
ExecStart=/usr/bin/python3 ${PROJECT_DIR}/pi_config_web.py
Restart=always
RestartSec=5
User=${CURRENT_USER}
Environment=PYTHONUNBUFFERED=1
Environment=DOTWATCH_AGENT_DIR=${PROJECT_DIR}
Environment=DOTWATCH_CONFIG_HOST=0.0.0.0
Environment=DOTWATCH_CONFIG_PORT=8080

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable dotwatch-pi-config-ui
sudo systemctl restart dotwatch-pi-config-ui

echo ""
echo "Config UI installed."
echo "Open: http://<PI-IP>:8080"
echo "Status page: http://<PI-IP>:8080/status"
echo "Default username: admin"
echo "Default password: change-this-config-password"
echo ""
echo "Important: Change CONFIG_UI_PASSWORD in the web page after first login."
