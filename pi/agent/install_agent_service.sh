#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${1:-/home/pi/dotwatch-pi-agent}"
SERVICE_NAME="dotwatch-pi-agent"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
RUN_USER="${DOTWATCH_RUN_USER:-$(id -un)}"
PYTHON_BIN="${APP_DIR}/venv/bin/python"

if [ ! -f "${APP_DIR}/main.py" ]; then
  echo "main.py not found in ${APP_DIR}"
  exit 1
fi

mkdir -p "${APP_DIR}/data" "${APP_DIR}/logs"

if [ ! -f "${APP_DIR}/.env" ]; then
  if [ -f "${APP_DIR}/.env.example" ]; then
    cp "${APP_DIR}/.env.example" "${APP_DIR}/.env"
    echo "Created ${APP_DIR}/.env from .env.example"
    echo "Edit DEVICE_CODE and DEVICE_SECRET before starting production ingest."
  else
    echo ".env not found in ${APP_DIR} and .env.example is missing"
    exit 1
  fi
fi

cd "${APP_DIR}"
python3 -m venv venv
"${PYTHON_BIN}" -m pip install --upgrade pip
"${PYTHON_BIN}" -m pip install -r requirements.txt

sudo tee "${SERVICE_FILE}" >/dev/null <<EOF
[Unit]
Description=dotWatch Raspberry Pi Agent
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=300
StartLimitBurst=10

[Service]
Type=simple
User=${RUN_USER}
WorkingDirectory=${APP_DIR}
ExecStart=${PYTHON_BIN} ${APP_DIR}/main.py
Restart=always
RestartSec=10
TimeoutStopSec=20
KillSignal=SIGTERM
Environment=PYTHONUNBUFFERED=1

# Basic hardening while keeping USB/serial/network access usable on Raspberry Pi.
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ReadWritePaths=${APP_DIR}

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable "${SERVICE_NAME}"
sudo systemctl restart "${SERVICE_NAME}"

echo "Installed and started ${SERVICE_NAME}"
echo "Check status: sudo systemctl status ${SERVICE_NAME} --no-pager"
echo "Follow logs:  sudo journalctl -u ${SERVICE_NAME} -f"
