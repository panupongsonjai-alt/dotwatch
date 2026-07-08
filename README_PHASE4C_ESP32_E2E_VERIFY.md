# dotWatch Phase 4C — Verify ESP32 + Model Admin End-to-End

ใช้หลังจากติดตั้ง Phase 4B แล้ว เพื่อเช็คว่า:

- Backend มี model `esp32_dht3`
- `dw_20ch` ยังอยู่
- Dashboard หน้า Device โหลด model จาก backend
- Admin มีหน้า Models
- Backend health ใช้งานได้
- ทดสอบ ESP32 ingest simulator ได้โดยไม่ต้องส่ง secret ในแชท

## 1) แตกไฟล์ลง repo

แตก zip ลงที่:

```text
D:\IoT Project\dotwatch
```

## 2) ตรวจแบบปลอดภัยก่อน

```powershell
cd "D:\IoT Project\dotwatch"

powershell -NoProfile -ExecutionPolicy Bypass -File .\dotwatch-phase4c-verify-esp32-e2e.ps1 `
  -BackendUrl "https://dotwatch-backend.onrender.com"
```

## 3) ถ้าต้องการ build dashboard/admin ด้วย

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\dotwatch-phase4c-verify-esp32-e2e.ps1 `
  -BackendUrl "https://dotwatch-backend.onrender.com" `
  -BuildDashboard `
  -BuildAdmin
```

## 4) ทดสอบ API `/api/device-models`

Endpoint นี้ต้องมี Firebase ID token ของ user เพราะ backend ใช้ auth

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\dotwatch-phase4c-verify-esp32-e2e.ps1 `
  -BackendUrl "https://dotwatch-backend.onrender.com" `
  -AuthToken "YOUR_FIREBASE_ID_TOKEN"
```

ถ้าไม่ใส่ token สคริปต์จะข้ามข้อนี้ ไม่ถือว่า fail

## 5) ทดสอบ ESP32 ingest simulator

หลังจากสร้าง device ใหม่ใน Dashboard เป็น model `ESP32-DHT3` แล้ว ให้ใช้ `DEVICE_CODE` และ `DEVICE_SECRET` ของ ESP32 device ตัวใหม่เท่านั้น

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\dotwatch-phase4c-verify-esp32-e2e.ps1 `
  -BackendUrl "https://dotwatch-backend.onrender.com" `
  -TestIngest `
  -DeviceCode "DW-ESP32-XXXX" `
  -DeviceSecret "YOUR_ESP32_DEVICE_SECRET"
```

อย่าใช้ device code/secret ของ Raspberry Pi

## ผลที่ต้องการ

```text
Contains dw_20ch: YES
Contains esp32_dht3: YES
health HTTP 200
ESP32 ingest simulator status: 201 หรือ 200
```
