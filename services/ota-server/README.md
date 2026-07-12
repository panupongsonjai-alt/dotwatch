# dotWatch OTA Server

บริการขนาดเล็กสำหรับทดสอบและใช้งาน Internet OTA ของ ESP32 โดยแยกจาก Backend หลัก เพื่อลดความเสี่ยงต่อ API เดิม

## Endpoints

- `GET /health`
- `GET /api/device-firmware/check`
- `GET /api/device-firmware/download/:filename`
- `POST /api/device-firmware/report`

ทุก Firmware endpoint ตรวจ `x-device-code` และ `x-device-secret` เมื่อ `OTA_ALLOW_UNREGISTERED_DEVICES=false`

## Local run

```powershell
cd "D:\IoT Project\dotwatch\services\ota-server"
Copy-Item .env.example .env
$env:OTA_ALLOW_UNREGISTERED_DEVICES = "true" # ใช้เฉพาะทดสอบ local
npm run check
npm start
```

## Publish a release

หลัง build ESP32 แล้ว:

```powershell
cd "D:\IoT Project\dotwatch\services\ota-server"
node .\scripts\publish-release.mjs `
  --file "D:\IoT Project\dotwatch\esp32\dotwatch_esp32_product\.pio\build\esp32_product\firmware.bin" `
  --version "esp32-product-1.2.0" `
  --build 1200 `
  --model esp32_dht3 `
  --channel stable `
  --notes "Improve OTA reliability"
```

`--auto true` อนุญาตให้อุปกรณ์ที่เปิด Auto Install ติดตั้งอัตโนมัติ และ `--mandatory true` ทำเครื่องหมาย Release บังคับ

## Render environment

ตั้งค่าใน Render:

- `PUBLIC_BASE_URL=https://<ชื่อ-service>.onrender.com`
- `OTA_ALLOW_UNREGISTERED_DEVICES=false`
- `OTA_DEVICE_SECRETS_JSON={"DW-...":"device-secret"}`

ห้าม commit Device Secret ลง Git
