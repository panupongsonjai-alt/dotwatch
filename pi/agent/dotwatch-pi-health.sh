#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${1:-/home/pi/dotwatch-pi-agent}"
PYTHON_BIN="${APP_DIR}/venv/bin/python"
QUEUE_PATH="${APP_DIR}/data/offline_queue.jsonl"

printf '\n== dotWatch Pi Gateway Health ==\n'
date -Is
printf 'Agent directory: %s\n' "${APP_DIR}"
printf '\n-- Services --\n'
systemctl is-active dotwatch-pi-agent || true
systemctl is-enabled dotwatch-pi-agent || true
systemctl is-active dotwatch-pi-config-ui || true
systemctl is-enabled dotwatch-pi-config-ui || true

printf '\n-- Network --\n'
ip route get 1.1.1.1 2>/dev/null | awk '{print "Primary IP: "$7; exit}' || true

printf '\n-- Queue --\n'
if [ -f "${QUEUE_PATH}" ]; then
  printf 'Pending queue rows: '
  wc -l < "${QUEUE_PATH}"
  printf 'Queue path: %s\n' "${QUEUE_PATH}"
else
  printf 'Pending queue rows: 0\n'
fi

printf '\n-- Self check --\n'
if [ -x "${PYTHON_BIN}" ] && [ -f "${APP_DIR}/agent_self_check.py" ]; then
  cd "${APP_DIR}"
  "${PYTHON_BIN}" "${APP_DIR}/agent_self_check.py" || true
else
  echo "Self check unavailable. Install venv and upload agent_self_check.py first."
fi

printf '\n-- Recent Agent Logs --\n'
journalctl -u dotwatch-pi-agent -n 80 --no-pager || true
