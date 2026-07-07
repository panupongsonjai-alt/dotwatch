# Phase 2 — Raspberry Pi Gateway MVP

## Goal

Make the Raspberry Pi agent more reliable before expanding dotWatch features. Phase 2 is limited to Pi gateway reliability and deployment safety. It intentionally avoids large Dashboard or Backend refactors.

## Added capabilities

### 1. Product-style agent loop

`pi/agent/main.py` now has:

- Graceful shutdown on `SIGTERM` and `Ctrl+C`.
- Clear startup banner.
- Masked device secret in logs.
- Sorted metric logging such as `metric_1=... metric_2=...`.
- Request timeout config.
- Backoff after repeated failures.
- Queue flush before each new send cycle.

### 2. Offline queue

New file:

```text
pi/agent/runtime/offline_queue.py
```

When the backend or network is unavailable, the current payload is saved to:

```text
/home/pi/dotwatch-pi-agent/data/offline_queue.jsonl
```

The queue is flushed automatically when the backend becomes reachable again.

Default `.env` values:

```text
OFFLINE_QUEUE_ENABLED=true
OFFLINE_QUEUE_MAX_ITEMS=1000
QUEUE_FLUSH_LIMIT=20
MAX_BACKOFF_SECONDS=60
```

### 3. Agent self check

New file:

```text
pi/agent/agent_self_check.py
```

Run on Raspberry Pi:

```bash
cd /home/pi/dotwatch-pi-agent
./venv/bin/python agent_self_check.py
```

To send one dummy telemetry packet:

```bash
./venv/bin/python agent_self_check.py --send-test
```

### 4. Gateway health script

New file:

```text
pi/agent/dotwatch-pi-health.sh
```

Run:

```bash
/home/pi/dotwatch-pi-agent/dotwatch-pi-health.sh
```

It shows service status, primary IP, queue count, self-check output, and recent logs.

### 5. Improved systemd installers

Updated:

```text
pi/agent/install_agent_service.sh
pi/agent/install_config_ui_service.sh
```

They now:

- Create `data` and `logs` folders.
- Create `.env` from `.env.example` when missing.
- Use current Pi user by default.
- Add safer systemd settings while preserving serial/network access.

### 6. Modbus source aliases

`SENSOR_SOURCE` now supports:

```text
dummy
modbus
modbus_tcp
modbus_rtu
```

`modbus` uses the `mode` in `modbus_config.json`.

`modbus_tcp` and `modbus_rtu` force the mode from `.env`.

### 7. Config UI Phase 2 updates

Updated:

```text
pi/agent/pi_config_web.py
pi/config-ui/pi_config_web.py
```

The UI now exposes:

- Request timeout
- Offline queue enabled/disabled
- Queue max items
- Queue flush limit
- Max backoff
- Queue count in status/snapshot
- Source options for Modbus TCP and RTU

### 8. Windows install/check scripts

New scripts:

```text
pi/scripts/pi-phase2-install-gateway.ps1
pi/scripts/pi-phase2-check-gateway.ps1
```

Install or update the Pi gateway:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File pi\scripts\pi-phase2-install-gateway.ps1 `
  -PiHost 192.168.1.154 `
  -PiUser pi `
  -DeviceCode "DW-CHANGE-ME" `
  -DeviceSecret "PASTE_DEVICE_SECRET_HERE" `
  -ApiUrl "https://dotwatch-backend.onrender.com" `
  -SensorSource dummy `
  -SendIntervalSeconds 10
```

Check the Pi:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File pi\scripts\pi-phase2-check-gateway.ps1 `
  -PiHost 192.168.1.154 `
  -PiUser pi
```

## Validation

Local verification command:

```powershell
npm run verify:phase2
```

This checks required files and Python syntax for the Pi agent.

## Recommended test order

1. Install with `-SensorSource dummy`.
2. Confirm dummy `metric_1`, `metric_2`, `metric_3` appear in Dashboard.
3. Open Config UI at `http://192.168.1.154:8080`.
4. Configure Modbus TCP first.
5. Use `Save & Test Read`.
6. Use `Save & Restart Agent`.
7. Check logs with `pi-phase2-check-gateway.ps1`.

## Next phase suggestion

After this phase is stable, the next practical phase is **Phase 3: Dashboard Metric UX + Device Detail polish**, especially:

- Metric display names for `metric_1` to `metric_20`
- Better per-device history chart
- Alarm rule setup per metric
- Cleaner device detail layout
- Dashboard-wide style unification
