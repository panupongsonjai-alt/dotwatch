# dotWatch Raspberry Pi Field Commissioning Checklist

Use one checklist per physical Raspberry Pi.

## Device identity

- Device code: `DW-________________`
- Device name/location: `________________`
- Pi IP: `________________`
- Sensor source: `dummy / modbus_tcp / modbus_rtu`
- Backend URL: `________________`
- Date/time: `________________`

## Before upload

- [ ] Device exists in backend/dashboard.
- [ ] Device secret is generated and stored safely.
- [ ] Do not paste real secrets into chat, Git, screenshots or exported zip files.
- [ ] Pi can be reached by SSH.
- [ ] Pi clock/timezone are correct enough for logs.

## Upload and dependency check

```powershell
cd "D:\IoT Project\dotwatch"

powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\pi-field-commissioning.ps1 `
  -PiHost <PI_IP> `
  -PiUser pi `
  -UploadAgent `
  -InstallDependencies `
  -Cycles 3 `
  -ServiceStatus
```

- [ ] SSH connectivity OK.
- [ ] Required remote files OK.
- [ ] Python venv OK.
- [ ] `agent_self_check.py` runs.

## Dry sensor test

```bash
cd /home/pi/dotwatch-pi-agent
./venv/bin/python agent_field_test.py --cycles 3
```

- [ ] Sensor read OK.
- [ ] Metrics shown as `metric_1`, `metric_2`, `metric_3`, etc.
- [ ] No raw device secret printed.

## Real ingest test

```bash
cd /home/pi/dotwatch-pi-agent
./venv/bin/python agent_field_test.py --cycles 3 --send --queue-test
```

- [ ] Backend health OK.
- [ ] Backend ingest OK.
- [ ] Offline queue test OK.
- [ ] Dashboard latest value updates.
- [ ] History page shows new values.

## Service enablement

```bash
cd /home/pi/dotwatch-pi-agent
sudo bash install_agent_service.sh
sudo systemctl status dotwatch-pi-agent --no-pager
journalctl -u dotwatch-pi-agent -n 80 --no-pager
```

- [ ] Agent service active.
- [ ] Logs show `SENT` and `SERVER_OK`.
- [ ] No repeated 401/403/429/500 errors.

## Config UI safe access

```powershell
ssh -L 8080:127.0.0.1:8080 pi@<PI_IP>
```

Open:

```text
http://127.0.0.1:8080
```

- [ ] Config UI is bound to `127.0.0.1` unless intentionally using LAN mode.
- [ ] Config UI password is not default/weak.

## Final sign-off

- [ ] Report saved: `/home/pi/dotwatch-pi-agent/reports/field-test-latest.json`
- [ ] Device dashboard status: online
- [ ] Last seen updates continuously
- [ ] Metric labels match expected mapping
- [ ] Field notes recorded
