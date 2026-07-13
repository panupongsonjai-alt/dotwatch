# dotTH ESP32 Product — Dashboard Portal + Internet OTA

Firmware สำหรับ ESP32 Temperature/Humidity ที่แยกโครงสร้างเป็นโมดูลและรองรับการอัปเดตผ่านอินเทอร์เน็ต

## Current Firmware

```text
Version : esp32-product-1.1.0-ota
Build   : 1100
Model   : esp32_dht3
```

## Main modules

```text
src/app            Application orchestration
src/backend        Telemetry client
src/config         NVS configuration
src/network        Wi-Fi and time
src/ota            HTTPS Internet OTA
src/portal         Local web server and generated assets
src/portal/views   Page renderers
src/sensors        Temperature/Humidity
src/recovery       Recovery logic
portal-preview     Modular editable web app
```

## OTA safety

- Dual OTA slots from `partitions_ota.csv`
- Manifest validation by Model and Build Number
- HTTPS with configured/embedded Root CA
- Device Code/Secret headers
- Firmware size check
- SHA-256 validation before activating the new image
- Manual and controlled Auto Install
- OTA status available through `/json`

## First installation

The first OTA-capable version must be uploaded through USB because the partition table changes.

```powershell
cd "D:\IoT Project\dotwatch\esp32\dotwatch_esp32_product"
py -m platformio run -t clean
py -m platformio run
py -m platformio run -t upload --upload-port COM6
py -m platformio device monitor --port COM6 --baud 115200
```

Future application firmware releases can be installed from the local `Firmware` page through the internet.

## Edit the web app

Edit only modular files:

```text
portal-preview/src/components
portal-preview/src/pages
portal-preview/src/features
portal-preview/src/styles
portal-preview/src/shared
```

Generate preview and firmware assets:

```powershell
cd "D:\IoT Project\dotwatch\esp32\dotwatch_esp32_product\portal-preview"
npm run check
npm run dev
```

Do not edit these generated files directly:

```text
portal-preview/index.html
portal-preview/generated/*
src/portal/PortalAssets.h
```

## Detailed OTA guide

See:

```text
README_ESP32_INTERNET_OTA.md
```


## First IP Lock

Firmware รุ่นนี้จำ IP ที่ได้รับจาก DHCP ครั้งแรกของแต่ละ SSID แล้วใช้เป็น Fixed IP หลัง Restart ดูรายละเอียดใน `README_ESP32_FIRST_IP_LOCK.md` ที่โฟลเดอร์หลักของแพ็กเกจ

## Fixed-IP recovery 1.1.3

This release keeps the invalid-address checks from 1.1.2 and fixes DHCP recovery for Arduino-ESP32 2.0.17 by using `0.0.0.0` for all DHCP fields instead of `INADDR_NONE` (`255.255.255.255`). It fully resets the STA interface before retrying and replaces an unusable locked lease with the DHCP address that successfully reconnects. No factory reset is required after flashing 1.1.3.
