# dotWatch Pi Config UI - Phase 2 Security Hardened

Local web UI for Raspberry Pi Gateway setup and operation.

## Security default

From this phase, the Config UI binds to localhost by default:

```text
http://127.0.0.1:8080
```

Recommended access from Windows PowerShell:

```powershell
ssh -L 8080:127.0.0.1:8080 pi@<PI_IP>
```

Then open:

```text
http://127.0.0.1:8080
```

The installer generates a strong `CONFIG_UI_PASSWORD` when `.env` is missing, empty, or still uses the old default password.

## Install service

Safe local-only install:

```bash
cd /home/pi/dotwatch-pi-agent
sudo bash install_config_ui_service.sh --project-dir /home/pi/dotwatch-pi-agent
```

LAN access is allowed only when explicitly requested and should be used only on a trusted network:

```bash
sudo bash install_config_ui_service.sh --project-dir /home/pi/dotwatch-pi-agent --lan --password 'CHANGE_TO_A_LONG_RANDOM_PASSWORD'
```

## Pages

- Setup: Backend URL, Device Code/Secret, sensor source, queue/retry behavior, UI password
- Live: Modbus TCP/RTU setup, 20 metric mapping, read-once and continuous live preview
- Status: service status, system health, offline queue count, recent agent logs
- Diagnostics: backend health, USB/RS485 scan, last Modbus test, dependency install

Supported `SENSOR_SOURCE` values:

```text
dummy
modbus
modbus_tcp
modbus_rtu
```
