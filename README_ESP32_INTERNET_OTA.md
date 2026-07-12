# dotWatch ESP32 Internet OTA — Installation and Release Guide

ชุดนี้เพิ่มระบบอัปเดต ESP32 ผ่านอินเทอร์เน็ตโดยไม่ต้องต่อสาย USB หลังติดตั้ง Firmware OTA รุ่นแรกแล้ว

## โครงสร้างที่เพิ่ม

```text
esp32/dotwatch_esp32_product/
├─ partitions_ota.csv
├─ src/ota/
│  ├─ OtaManager.h
│  └─ OtaManager.cpp
├─ src/portal/views/FirmwarePage.cpp
└─ portal-preview/src/pages/FirmwarePage.html

services/ota-server/
├─ server.mjs
├─ releases/manifest.json
├─ scripts/publish-release.mjs
└─ render.yaml

scripts/
├─ dotwatch-publish-esp32-ota.ps1
└─ dotwatch-verify-esp32-ota.ps1
```

## ความสามารถ

- ESP32 ตรวจ Release ผ่าน HTTPS
- ใช้ `x-device-code` และ `x-device-secret`
- จำกัด Release ตาม `modelKey`, `channel` และ `buildNumber`
- ตรวจขนาด Firmware ก่อนติดตั้ง
- คำนวณและตรวจ SHA-256 ระหว่างดาวน์โหลด
- เขียนลง OTA partition ที่ไม่ได้ใช้งาน
- Restart เข้าสู่ Firmware ใหม่เมื่อยืนยันไฟล์ผ่าน
- รายงานสถานะกลับ OTA Server
- มีหน้า Firmware Update ใน Local Device Console
- รองรับ Manual Install และ Auto Install

## 1. วางไฟล์

แตก ZIP ทับโฟลเดอร์หลัก:

```text
D:\IoT Project\dotwatch
```

## 2. ตรวจสอบไฟล์

```powershell
cd "D:\IoT Project\dotwatch"

powershell -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\dotwatch-verify-esp32-ota.ps1 `
  -RepoRoot "D:\IoT Project\dotwatch"
```

## 3. Build Firmware OTA รุ่นแรก

```powershell
cd "D:\IoT Project\dotwatch\esp32\dotwatch_esp32_product"

py -m platformio run -t clean
py -m platformio run
```

Firmware ต้องมีขนาดไม่เกิน OTA slot 1.5 MiB

## 4. Upload รุ่นแรกผ่านสาย USB

ขั้นตอนนี้จำเป็นหนึ่งครั้งเพื่อแฟลช `partitions_ota.csv` และ Firmware ที่มีระบบ OTA ลงบอร์ด

```powershell
py -m platformio run -t upload --upload-port COM6
```

เปิด Serial Monitor:

```powershell
py -m platformio device monitor --port COM6 --baud 115200
```

หลังจากรุ่นนี้ทำงานแล้ว Firmware รุ่นถัดไปสามารถติดตั้งผ่านอินเทอร์เน็ตได้

## 5. Deploy OTA Server บน Render

สร้าง Render Web Service โดยใช้:

```text
Root Directory : services/ota-server
Build Command  : npm run check
Start Command  : npm start
Health Path    : /health
```

Environment Variables:

```text
PUBLIC_BASE_URL=https://ชื่อ-service.onrender.com
OTA_ALLOW_UNREGISTERED_DEVICES=false
OTA_DEVICE_SECRETS_JSON={"DW-DEVICE-CODE":"DEVICE-SECRET"}
```

ห้ามเก็บ Device Secret ใน Git

ทดสอบ Health:

```powershell
Invoke-RestMethod "https://ชื่อ-service.onrender.com/health"
```

## 6. ตั้งค่า ESP32

เปิด Local IP ของ ESP32 แล้วเข้าสู่ระบบด้วย Local Admin PIN จากนั้นเปิดเมนู `Firmware`

ตั้งค่า:

```text
OTA Base URL : https://ชื่อ-service.onrender.com
Channel      : stable
Enable OTA   : เปิด
Auto Install : ปิดในช่วงทดสอบ
```

กด `Save OTA Settings` แล้วกด `Check for Update`

## 7. สร้าง Firmware รุ่นถัดไป

แก้ไฟล์:

```text
esp32/dotwatch_esp32_product/include/FirmwareVersion.h
```

ตัวอย่าง:

```cpp
#define DOTWATCH_FIRMWARE_VERSION "esp32-product-1.2.0"
#define DOTWATCH_FIRMWARE_BUILD 1200UL
```

`DOTWATCH_FIRMWARE_BUILD` ต้องมากกว่ารุ่นที่อยู่บนอุปกรณ์เสมอ

Build:

```powershell
cd "D:\IoT Project\dotwatch\esp32\dotwatch_esp32_product"
py -m platformio run -t clean
py -m platformio run
```

## 8. Publish Release

```powershell
cd "D:\IoT Project\dotwatch"

powershell -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\dotwatch-publish-esp32-ota.ps1 `
  -RepoRoot "D:\IoT Project\dotwatch" `
  -Channel stable `
  -Notes "Improve OTA and sensor stability"
```

สคริปต์จะอ่าน Version และ Build จาก `include/FirmwareVersion.h` โดยอัตโนมัติ และตรวจว่าไฟล์ไม่เกิน OTA slot ก่อนดำเนินการ จากนั้น:

1. คัดลอก `.pio/build/esp32_product/firmware.bin`
2. เปลี่ยนชื่อไฟล์ตาม Model/Channel/Build
3. คำนวณ SHA-256
4. บันทึกขนาดไฟล์
5. อัปเดต `services/ota-server/releases/manifest.json`

ตรวจแล้ว Push:

```powershell
cd "D:\IoT Project\dotwatch"
git status
git add services/ota-server/releases
git commit -m "release(esp32): publish esp32-product-1.2.0 build 1200"
git push origin main
```

Render จะ Deploy Release ใหม่

## 9. ติดตั้งจาก ESP32

เปิดหน้า `Firmware`:

1. กด `Check for Update`
2. รอจนสถานะเป็น `UPDATE_AVAILABLE`
3. ตรวจ Version, Build และ Release Notes
4. กด `Install Update`
5. ระหว่างดาวน์โหลดห้ามตัดไฟ
6. ระบบตรวจ SHA-256 แล้ว Restart อัตโนมัติ
7. เปิดหน้า Firmware อีกครั้งและตรวจ Current Version

## Auto Install

ใน ESP32 ให้เปิด `Auto Install` และตอน Publish เพิ่ม `-AutoInstall`

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\dotwatch-publish-esp32-ota.ps1 `
  -RepoRoot "D:\IoT Project\dotwatch" `
  -Channel stable `
  -AutoInstall `
  -Notes "Maintenance release"
```

ช่วงเริ่มต้นควรใช้ Manual Install ก่อนจนทดสอบอย่างน้อย 2–3 รุ่น

## API Contract

ESP32 ตรวจ Release:

```http
GET /api/device-firmware/check?modelKey=esp32_dht3&currentBuild=1100&channel=stable
x-device-code: DW-...
x-device-secret: ...
```

OTA Server ตอบ:

```json
{
  "ok": true,
  "updateAvailable": true,
  "release": {
    "modelKey": "esp32_dht3",
    "channel": "stable",
    "version": "esp32-product-1.2.0",
    "buildNumber": 1200,
    "size": 1212416,
    "sha256": "64-character-sha256",
    "mandatory": false,
    "autoInstall": false,
    "releaseNotes": "Improve OTA reliability",
    "firmwareUrl": "https://.../api/device-firmware/download/...bin"
  }
}
```

## การแก้ปัญหา

### `OTA partition ไม่พร้อม`

Firmware รุ่นแรกยังไม่ได้ Upload ผ่าน USB พร้อม `partitions_ota.csv` ให้ Clean, Build และ Upload ทาง USB ใหม่

### `SHA-256 ไม่ตรง`

ไฟล์บน Server ไม่ตรงกับ Manifest ให้ Publish Release ใหม่และ Commit ทั้ง `.bin` และ `manifest.json`

### `Invalid device credentials`

ตรวจ `OTA_DEVICE_SECRETS_JSON`, Device Code และ Device Secret ให้ตรงกัน

### `HTTPS Root CA is required`

ตรวจ Root CA ในหน้า Security หรือใช้ OTA Server ที่ Certificate อยู่ภายใต้ Root CA ที่ Firmware รองรับ

### Firmware ใหญ่เกินไป

ตรวจผล Build ต้องไม่เกิน 1,572,864 bytes ลด Static HTML/Assets หรือ Library ที่ไม่ได้ใช้

## ความปลอดภัย

- เปิด `OTA_ALLOW_UNREGISTERED_DEVICES=false` บน Production
- เก็บ Device Secret ใน Render Environment เท่านั้น
- ใช้ HTTPS
- ห้ามปิด SHA-256 verification
- ทดสอบ Manual Install ก่อน Auto Install
- อย่าเปลี่ยน Partition Table ผ่าน OTA
- สำรอง Firmware รุ่นที่ใช้งานได้ก่อน Publish รุ่นใหม่

ขั้นถัดไปสำหรับ Production Fleet คือย้าย Device Authentication และ OTA Release History เข้า `dotwatch-backend` โดยตรง รวมถึง Firmware Signing และ Staged Rollout
