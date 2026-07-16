# dotWatch Production Release Audit

ชุดตรวจระบบหลักก่อนปิด Production Release

ขอบเขต:

- Backend
- Dashboard
- Admin
- Platform verification phases
- Security S1-S3
- OTA server
- ESP32 product software
- Render backend health

ไม่รวม Mobile, local database และการ provision Secure Boot/Flash Encryption แบบถาวร

## รัน

```powershell
Set-Location "D:\IoT Project\dotwatch"

powershell `
  -NoProfile `
  -ExecutionPolicy Bypass `
  -File ".\scripts\production-release-audit.ps1"
```

รายงานอยู่ที่:

```text
_reports\production-release-audit\<timestamp>\
```

ไฟล์สำคัญ:

- summary.txt
- summary.csv
- summary.json
- log แยกแต่ละ check

ถ้ายังไม่ต้องตรวจ ESP32 build:

```powershell
powershell `
  -NoProfile `
  -ExecutionPolicy Bypass `
  -File ".\scripts\production-release-audit.ps1" `
  -SkipEsp32Product
```
