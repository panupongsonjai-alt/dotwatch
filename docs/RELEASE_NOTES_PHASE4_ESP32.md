# dotWatch Phase 4 Release Notes — ESP32 Production Baseline

## Summary

Phase 4 เพิ่ม ESP32-DHT3 เป็น device model ใหม่ของ dotWatch โดยไม่แทนที่ Raspberry Pi / DW20CH

## Included

```text
Phase 4A: เพิ่ม ESP32-DHT3 model
Phase 4B: Model Admin + Dashboard dynamic device models
Phase 4C: ESP32 end-to-end verification
Phase 4D: Post-deploy verification
Phase 4E: ESP32 config portal
Phase 4F: ESP32 production hardening
Phase 4G: ESP32 commissioning kit
Phase 4H: ESP32 local admin portal with PIN
Phase 4I: ESP32 dashboard device detail
Phase 4K: Production release checklist and baseline lock
```

## Production Model

```text
model_key  : esp32_dht3
model_name : ESP32-DHT3
metric_1   : Temperature (°C)
metric_2   : Humidity (%)
metric_3   : WiFi RSSI (dBm)
```

## Firmware

```text
Production firmware folder:
esp32/dotwatch_esp32_dht3_local_admin

Firmware version:
esp32-dht3-local-admin-0.4.0

Build:
py -m platformio run

Upload:
py -m platformio run -t upload

Monitor:
py -m platformio device monitor -b 115200
```

## Local Admin

```text
URL:
http://ESP32_IP/

Default PIN:
6 ตัวท้ายของ Device Code

Reset config:
กด BOOT ค้าง 6 วินาที
```

## Dashboard

```text
Devices list:
Temp / Hum / RSSI

Device Detail:
Temperature / Humidity / WiFi RSSI
Local Admin URL hint
Default PIN hint
```

## Backend

```text
Health:
GET /health

Ingest:
POST /api/ingest

Device auth:
x-device-code
x-device-secret
```

## Compatibility

```text
Raspberry Pi / DW20CH: preserved
ESP32-DHT3: additional model
Backend: shared ingest pipeline
Dashboard: dynamic model list
Admin: model management available
```

## Known Limitations

```text
1. ESP32 firmware still uses WiFiClientSecure.setInsecure() for Render HTTPS convenience.
2. Local Admin PIN is suitable for LAN-level protection, not public internet exposure.
3. Baseline reports are generated artifacts and should not be committed.
```

## Recommended Next Phase

```text
Phase 5A: Root CA / HTTPS certificate hardening for ESP32
Phase 5B: OTA firmware update
Phase 5C: Device provisioning workflow for multiple ESP32 units
```
