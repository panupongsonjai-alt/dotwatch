# dotWatch OTA Server

บริการ Internet OTA ของ ESP32 แยกจาก Backend หลัก

## Endpoints

- `GET /health`
- `GET /api/device-firmware/check`
- `GET /api/device-firmware/download/:filename`
- `POST /api/device-firmware/report`

Firmware endpoints ตรวจ `x-device-code` และ `x-device-secret` ทุก request

## Production device registry

ใช้ registry แบบผูก device กับ model/channel:

```env
NODE_ENV=production
OTA_ALLOW_UNREGISTERED_DEVICES=false
OTA_REQUIRE_DEVICE_SCOPE=true
OTA_DEVICE_REGISTRY_JSON={"DW-EXAMPLE":{"secret":"replace-with-device-secret","modelKeys":["esp32_dht3"],"channels":["stable"]}}
OTA_DEVICE_SECRETS_JSON={}
```

เมื่อ `OTA_REQUIRE_DEVICE_SCOPE=true` ทั้ง firmware check และ download จะปฏิเสธ model/channel ที่ device ไม่ได้รับอนุญาต

`OTA_DEVICE_SECRETS_JSON` รองรับเพื่อ migration เท่านั้น แต่ production startup จะไม่ผ่านหากเปิด scope แล้ว entry ยังไม่มี `modelKeys` และ `channels`

## Security limits

```env
OTA_MAX_BODY_BYTES=16384
OTA_RATE_LIMIT_WINDOW_MS=60000
OTA_RATE_LIMIT_PER_IP=120
OTA_RATE_LIMIT_PER_DEVICE=60
OTA_AUTH_FAILURE_LIMIT_PER_IP=20
OTA_AUTH_FAILURE_LIMIT_PER_DEVICE=10
OTA_RATE_LIMIT_MAX_ENTRIES=10000
```

## Local run

```powershell
Set-Location "D:\IoT Project\dotwatch\services\ota-server"
Copy-Item .env.example .env

# ใช้เฉพาะ local development
$env:NODE_ENV = "development"
$env:OTA_ALLOW_UNREGISTERED_DEVICES = "true"
$env:OTA_REQUIRE_DEVICE_SCOPE = "false"

npm run check
npm start
```

## Publish a release

```powershell
Set-Location "D:\IoT Project\dotwatch\services\ota-server"

node .\scripts\publish-release.mjs `
  --file "D:\IoT Project\dotwatch\esp32\dotwatch_esp32_product\.pio\build\esp32_product\firmware.bin" `
  --version "esp32-product-1.2.0" `
  --build 1200 `
  --model esp32_dht3 `
  --channel stable `
  --notes "Improve OTA reliability"
```

`--auto true` อนุญาตให้อุปกรณ์ที่เปิด Auto Install ติดตั้งอัตโนมัติ และ `--mandatory true` ทำเครื่องหมาย release บังคับ

รายละเอียด Phase S2 ดูที่ `docs/PHASE_S2_NETWORK_OTA_HARDENING_TH.md`
