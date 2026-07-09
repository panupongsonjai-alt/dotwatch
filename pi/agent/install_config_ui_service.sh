#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="/home/pi/dotwatch-pi-agent"
CONFIG_HOST="${DOTWATCH_CONFIG_HOST:-127.0.0.1}"
CONFIG_PORT="${DOTWATCH_CONFIG_PORT:-8080}"
CONFIG_USERNAME="${DOTWATCH_CONFIG_USERNAME:-admin}"
CONFIG_PASSWORD="${DOTWATCH_CONFIG_PASSWORD:-}"
CURRENT_USER="${DOTWATCH_RUN_USER:-$(id -un)}"
SERVICE_FILE="/etc/systemd/system/dotwatch-pi-config-ui.service"
ALLOW_LAN="false"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --project-dir)
      PROJECT_DIR="${2:?Missing value for --project-dir}"
      shift 2
      ;;
    --host)
      CONFIG_HOST="${2:?Missing value for --host}"
      shift 2
      ;;
    --port)
      CONFIG_PORT="${2:?Missing value for --port}"
      shift 2
      ;;
    --username)
      CONFIG_USERNAME="${2:?Missing value for --username}"
      shift 2
      ;;
    --password)
      CONFIG_PASSWORD="${2:?Missing value for --password}"
      shift 2
      ;;
    --lan)
      CONFIG_HOST="0.0.0.0"
      ALLOW_LAN="true"
      shift
      ;;
    --help|-h)
      cat <<'HELP_EOF'
Usage:
  sudo bash install_config_ui_service.sh [PROJECT_DIR]
  sudo bash install_config_ui_service.sh --project-dir /home/pi/dotwatch-pi-agent
  sudo bash install_config_ui_service.sh --project-dir /home/pi/dotwatch-pi-agent --lan --password 'strong-password'

Security defaults:
  - Binds to 127.0.0.1 by default.
  - Use SSH tunnel: ssh -L 8080:127.0.0.1:8080 pi@<PI_IP>
  - Use --lan only on a trusted local network and only with a strong password.
HELP_EOF
      exit 0
      ;;
    *)
      if [[ "$1" == /* || "$1" == .* || "$1" != --* ]]; then
        PROJECT_DIR="$1"
        shift
      else
        echo "Unknown option: $1" >&2
        exit 1
      fi
      ;;
  esac
done

is_weak_password() {
  local value="${1:-}"
  local lower
  lower="$(printf '%s' "$value" | tr '[:upper:]' '[:lower:]')"
  [ "${#value}" -lt 12 ] && return 0
  case "$lower" in
    admin|password|123456|12345678|change-this|change-this-config-password) return 0 ;;
  esac
  return 1
}

generate_password() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 24 | tr -d '\n'
    return
  fi
  python3 - <<'PY_EOF'
import secrets
print(secrets.token_urlsafe(24))
PY_EOF
}

set_env_key() {
  local file="$1"
  local key="$2"
  local value="$3"
  local escaped
  escaped="$(printf '%s' "$value" | sed 's/[&/\\]/\\&/g')"
  if grep -q "^${key}=" "$file"; then
    sed -i "s/^${key}=.*/${key}=${escaped}/" "$file"
  else
    printf '%s=%s\n' "$key" "$value" >> "$file"
  fi
}

mkdir -p "${PROJECT_DIR}/data" "${PROJECT_DIR}/logs"

if [ ! -f "${PROJECT_DIR}/pi_config_web.py" ]; then
  echo "pi_config_web.py not found in ${PROJECT_DIR}" >&2
  echo "Upload pi/agent/pi_config_web.py to ${PROJECT_DIR}/pi_config_web.py first." >&2
  exit 1
fi

chmod +x "${PROJECT_DIR}/pi_config_web.py"

ENV_FILE="${PROJECT_DIR}/.env"
if [ ! -f "$ENV_FILE" ]; then
  if [ -f "${PROJECT_DIR}/.env.example" ]; then
    cp "${PROJECT_DIR}/.env.example" "$ENV_FILE"
  else
    cat > "$ENV_FILE" <<AGENT_ENV_EOF
DOTWATCH_API_URL=https://dotwatch-backend.onrender.com
DEVICE_CODE=
DEVICE_SECRET=
SEND_INTERVAL_SECONDS=20
REQUEST_TIMEOUT_SECONDS=15
FIRMWARE_VERSION=rpi-agent-0.2.0
SENSOR_SOURCE=dummy
MODBUS_CONFIG_PATH=${PROJECT_DIR}/modbus_config.json
OFFLINE_QUEUE_ENABLED=true
OFFLINE_QUEUE_PATH=${PROJECT_DIR}/data/offline_queue.jsonl
OFFLINE_QUEUE_MAX_ITEMS=1000
QUEUE_FLUSH_LIMIT=1
MAX_BACKOFF_SECONDS=60
LOG_METRICS=true
CONFIG_UI_USERNAME=admin
CONFIG_UI_PASSWORD=
AGENT_ENV_EOF
  fi
fi

chmod 600 "$ENV_FILE" || true
set_env_key "$ENV_FILE" "CONFIG_UI_USERNAME" "$CONFIG_USERNAME"

current_password="$(grep '^CONFIG_UI_PASSWORD=' "$ENV_FILE" | tail -n1 | cut -d= -f2- || true)"
if [ -n "$CONFIG_PASSWORD" ]; then
  if is_weak_password "$CONFIG_PASSWORD"; then
    echo "CONFIG_UI_PASSWORD is too weak. Use at least 12 characters and avoid defaults." >&2
    exit 1
  fi
  set_env_key "$ENV_FILE" "CONFIG_UI_PASSWORD" "$CONFIG_PASSWORD"
elif is_weak_password "$current_password"; then
  CONFIG_PASSWORD="$(generate_password)"
  set_env_key "$ENV_FILE" "CONFIG_UI_PASSWORD" "$CONFIG_PASSWORD"
  echo "Generated new Config UI password for user '${CONFIG_USERNAME}':"
  echo "$CONFIG_PASSWORD"
  echo "Save this password now. It is stored in ${ENV_FILE} on the Pi."
fi

if [ "$ALLOW_LAN" = "true" ]; then
  final_password="$(grep '^CONFIG_UI_PASSWORD=' "$ENV_FILE" | tail -n1 | cut -d= -f2- || true)"
  if is_weak_password "$final_password"; then
    echo "LAN mode requires a strong CONFIG_UI_PASSWORD." >&2
    exit 1
  fi
fi

sudo tee "${SERVICE_FILE}" > /dev/null <<SERVICE_EOF
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
Environment=DOTWATCH_CONFIG_HOST=${CONFIG_HOST}
Environment=DOTWATCH_CONFIG_PORT=${CONFIG_PORT}
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ReadWritePaths=${PROJECT_DIR}

[Install]
WantedBy=multi-user.target
SERVICE_EOF

sudo systemctl daemon-reload
sudo systemctl enable dotwatch-pi-config-ui
sudo systemctl restart dotwatch-pi-config-ui

echo ""
echo "dotWatch Pi Config UI service installed."
echo "Host: ${CONFIG_HOST}"
echo "Port: ${CONFIG_PORT}"
echo "User: ${CONFIG_USERNAME}"
if [ "${CONFIG_HOST}" = "127.0.0.1" ]; then
  echo "Access safely with SSH tunnel from Windows PowerShell:"
  echo "ssh -L 8080:127.0.0.1:8080 pi@<PI_IP>"
  echo "Then open: http://127.0.0.1:8080"
else
  echo "LAN access enabled. Open: http://<PI_IP>:${CONFIG_PORT}"
fi

echo ""
sudo systemctl status dotwatch-pi-config-ui --no-pager
