# dotWatch Phase 2 — Raspberry Pi Gateway MVP

Phase 2 focuses on making the Raspberry Pi agent usable as a real gateway:

- Runs as a stable `systemd` service.
- Sends `metric_1`, `metric_2`, ... consistently.
- Supports Dummy, Modbus TCP, Modbus RTU, and forced Modbus modes from `.env`.
- Buffers telemetry to an offline queue when the backend/network is unavailable.
- Flushes queued telemetry automatically when the connection comes back.
- Adds Pi-side self check, health script, and Windows PowerShell install/check scripts.
- Keeps Config UI styling aligned with the dashboard-style Pi UI.

## 1. Place the files

Extract `dotwatch-phase2-pi-gateway-mvp.zip` and copy the inner `dotwatch` folder over your existing project folder:

```powershell
D:\IoT Project\dotwatch
```

## 2. Verify locally

```powershell
cd "D:\IoT Project\dotwatch"
npm run verify:phase2
```

## 3. Install/update Raspberry Pi gateway

Replace the device code and secret with the values from your Dashboard.

```powershell
cd "D:\IoT Project\dotwatch"

powershell -NoProfile -ExecutionPolicy Bypass -File pi\scripts\pi-phase2-install-gateway.ps1 `
  -PiHost 192.168.1.154 `
  -PiUser pi `
  -DeviceCode "DW-CHANGE-ME" `
  -DeviceSecret "PASTE_DEVICE_SECRET_HERE" `
  -ApiUrl "https://dotwatch-backend.onrender.com" `
  -SensorSource dummy `
  -SendIntervalSeconds 10
```

Start with `-SensorSource dummy` first. After dummy data appears on the dashboard, switch to Modbus from the Pi Config UI.

## 4. Check Raspberry Pi status

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File pi\scripts\pi-phase2-check-gateway.ps1 `
  -PiHost 192.168.1.154 `
  -PiUser pi
```

Open Config UI:

```text
http://192.168.1.154:8080
```

Default Config UI login is whatever you passed with `-ConfigUiUsername` and `-ConfigUiPassword`. If you do not pass them, the default is:

```text
admin / change-this-config-password
```

Change that password before using this outside your local network.

## 5. Switch to Modbus

In Config UI:

1. Go to `Live`.
2. Choose `Agent Source` = `Modbus`, `Force Modbus TCP`, or `Force Modbus RTU`.
3. Configure TCP/RTU settings.
4. Enable the metrics you want, up to 20 values.
5. Click `Save & Test Read`.
6. Click `Save & Restart Agent`.

## 6. Log commands on Pi

```bash
sudo systemctl status dotwatch-pi-agent --no-pager
sudo journalctl -u dotwatch-pi-agent -f
/home/pi/dotwatch-pi-agent/dotwatch-pi-health.sh
```

## Important

Do not commit or upload the real `.env` file. It contains `DEVICE_SECRET` and Config UI password.
