#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${1:-/home/pi/dotwatch-pi-agent}"
SERVICE_FILE="/etc/systemd/system/dotwatch-pi-config-ui.service"
CURRENT_USER="${DOTWATCH_RUN_USER:-$(id -un)}"

mkdir -p "${PROJECT_DIR}/data" "${PROJECT_DIR}/logs"

if [ ! -f "${PROJECT_DIR}/pi_config_web.py" ]; then
  echo "pi_config_web.py not found in ${PROJECT_DIR}"
  echo "Upload pi/agent/pi_config_web.py to ${PROJECT_DIR}/pi_config_web.py first."
  exit 1
fi

chmod +x "${PROJECT_DIR}/pi_config_web.py"

if [ ! -f "${PROJECT_DIR}/.env" ]; then
  if [ -f "${PROJECT_DIR}/.env.example" ]; then
    cp "${PROJECT_DIR}/.env.example" "${PROJECT_DIR}/.env"
  else
    cat > "${PROJECT_DIR}/.env" <<'EOF'
DOTWATCH_API_URL=https://dotwatch-backend.onrender.com
DEVICE_CODE=
DEVICE_SECRET=
SEND_INTERVAL_SECONDS=20
REQUEST_TIMEOUT_SECONDS=15
FIRMWARE_VERSION=rpi-agent-0.2.0
SENSOR_SOURCE=dummy
MODBUS_CONFIG_PATH=/home/pi/dotwatch-pi-agent/modbus_config.json
OFFLINE_QUEUE_ENABLED=true
OFFLINE_QUEUE_PATH=/home/pi/dotwatch-pi-agent/data/offline_queue.jsonl
OFFLINE_QUEUE_MAX_ITEMS=1000
QUEUE_FLUSH_LIMIT=1
MAX_BACKOFF_SECONDS=60
LOG_METRICS=true
CONFIG_UI_USERNAME=admin
CONFIG_UI_PASSWORD=change-this-config-password
EOF
  fi
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
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ReadWritePaths=${PROJECT_DIR}

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable dotwatch-pi-config-ui
sudo systemctl restart dotwatch-pi-config-ui
sudo systemctl status dotwatch-pi-config-ui --no-pager
