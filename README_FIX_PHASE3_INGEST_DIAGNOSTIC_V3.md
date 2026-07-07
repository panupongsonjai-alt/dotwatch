# dotWatch fix-phase3-ingest-diagnostic v3

ไฟล์นี้ใช้แทน `fix-phase3-ingest-diagnostic-v2.ps1` ที่เจอ error:

```text
The string is missing the terminator: '.
```

สาเหตุหลักมักเกิดจาก PowerShell here-string ปิดไม่ครบหรือปิดผิดตำแหน่ง เช่น `@'` / `'@` หรือ `@"` / `"@` มีช่องว่างผิดที่

## วิธีใช้

วางไฟล์ทั้งสองนี้ไว้ที่ root ของโปรเจกต์:

```text
D:\IoT Project\dotwatch\fix-phase3-ingest-diagnostic-v2.ps1
D:\IoT Project\dotwatch\fix-phase3-ingest-diagnostic-v3.ps1
```

แล้วรัน:

```powershell
cd "D:\IoT Project\dotwatch"
powershell -NoProfile -ExecutionPolicy Bypass -File .\fix-phase3-ingest-diagnostic-v3.ps1
```

ถ้าต้องการเช็ก backend ที่ Render:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\fix-phase3-ingest-diagnostic-v3.ps1 -BaseUrl "https://dotwatch-backend.onrender.com"
```

ถ้าต้องการรัน migration ด้วย:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\fix-phase3-ingest-diagnostic-v3.ps1 -RunMigrate
```

ถ้าต้องการส่ง test ingest ต้องใส่ Device Code / Device Secret:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\fix-phase3-ingest-diagnostic-v3.ps1 `
  -BaseUrl "https://dotwatch-backend.onrender.com" `
  -DeviceCode "DW-xxxx" `
  -DeviceSecret "PASTE_DEVICE_SECRET_HERE" `
  -SendTest
```

รายงานจะถูกสร้างที่:

```text
diagnostics\phase3-ingest-diagnostic-v3-YYYYMMDD-HHMMSS.md
```
