# dotWatch Phase 4G — ESP32 Production Commissioning Kit

Phase 4G เป็นชุดเอกสารและสคริปต์สำหรับนำ ESP32-DHT3 ไปใช้งานจริงหลายตัวแบบเป็นระบบ

## เป้าหมาย

```text
1. มี checklist ก่อนส่งมอบ/ติดตั้ง
2. มี device registry template
3. มี field test report template
4. มี script verify หลังติดตั้ง
5. ไม่เก็บ DEVICE_SECRET ลงไฟล์
6. รองรับ ESP32-DHT3 โดยไม่กระทบ Raspberry Pi / DW20CH
```

## ไฟล์ในชุดนี้

```text
README_PHASE4G_ESP32_COMMISSIONING.md
ESP32_COMMISSIONING_CHECKLIST.md
ESP32_FIELD_TEST_REPORT_TEMPLATE.md
esp32-device-registry-template.csv
dotwatch-phase4g-esp32-commissioning.ps1
```

## ติดตั้งไฟล์เข้า repo

แตก zip ลงที่:

```text
D:\IoT Project\dotwatch
```

แล้วรัน:

```powershell
cd "D:\IoT Project\dotwatch"

powershell -NoProfile -ExecutionPolicy Bypass -File .\dotwatch-phase4g-esp32-commissioning.ps1 `
  -RepoRoot "D:\IoT Project\dotwatch" `
  -InstallFiles
```

## ตรวจหลังติดตั้ง ESP32 1 ตัว

ใช้ secret ผ่าน PowerShell parameter เท่านั้น ไม่บันทึกลงไฟล์:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\dotwatch-phase4g-esp32-commissioning.ps1 `
  -RepoRoot "D:\IoT Project\dotwatch" `
  -BackendUrl "https://dotwatch-backend.onrender.com" `
  -DeviceCode "DW-ESP32-XXXX" `
  -DeviceSecret "YOUR_ESP32_DEVICE_SECRET" `
  -DeviceName "ESP32 Test 01" `
  -LocationName "Office" `
  -RunChecks `
  -TestIngest
```

## สร้าง report อย่างเดียว

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\dotwatch-phase4g-esp32-commissioning.ps1 `
  -RepoRoot "D:\IoT Project\dotwatch" `
  -DeviceCode "DW-ESP32-XXXX" `
  -DeviceName "ESP32 Test 01" `
  -LocationName "Office" `
  -CreateReportOnly
```

Report จะอยู่ที่:

```text
_reports/esp32-commissioning/
```

## Commit + Push docs/script

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\dotwatch-phase4g-esp32-commissioning.ps1 `
  -RepoRoot "D:\IoT Project\dotwatch" `
  -InstallFiles `
  -Commit `
  -Push
```

สคริปต์ stage เฉพาะไฟล์ Phase 4G เท่านั้น ไม่ stage secret, .env, temp files หรือไฟล์ deleted
