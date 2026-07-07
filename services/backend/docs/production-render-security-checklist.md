# dotWatch Production / Render Security Checklist

ใช้ตรวจหลังลง Patch 01-07 ก่อนเปิดใช้งานจริง

## 1. Backend Environment Variables

Render Backend ควรมี:

```text
NODE_ENV=production
DATABASE_URL=...
CORS_ORIGIN=https://dotwatch.onrender.com,http://localhost:5173
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY=...
INGEST_MIN_INTERVAL_SECONDS=5
```

สำคัญ:
- `CORS_ORIGIN` ห้ามเป็น `*`
- `FIREBASE_PRIVATE_KEY` ต้องอยู่ใน Environment เท่านั้น ห้าม commit ลง Git
- `DATABASE_URL` ห้ามอยู่ใน frontend

## 2. Frontend Environment Variables

Dashboard ควรมี:

```text
VITE_API_URL=https://dotwatch-backend.onrender.com
```

ห้ามมี:
- `DATABASE_URL`
- `FIREBASE_PRIVATE_KEY`
- `DEVICE_SECRET`

## 3. Backend Smoke Test

บนเครื่อง local ให้รัน:

```powershell
cd "D:\IoT Project\dotwatch-starter"
.\dotwatch-backend\security-tests\smoke-test-api.ps1 `
  -ApiUrl "https://dotwatch-backend.onrender.com" `
  -AllowedOrigin "https://dotwatch.onrender.com"
```

ถ้ามี Firebase token:

```powershell
$env:FIREBASE_ID_TOKEN="paste-token-here"

.\dotwatch-backend\security-tests\smoke-test-api.ps1 `
  -ApiUrl "https://dotwatch-backend.onrender.com" `
  -AllowedOrigin "https://dotwatch.onrender.com"
```

## 4. WebSocket Test

ทดสอบว่า WebSocket ไม่รับ userId ปลอม:

```bash
cd dotwatch-backend/security-tests
npm install ws
$env:DOTWATCH_WS_URL="wss://dotwatch-backend.onrender.com"
node test-websocket-token.js
```

ถ้ามี token:

```bash
$env:FIREBASE_ID_TOKEN="paste-token-here"
node test-websocket-token.js
```

## 5. Database Health Check

เปิด DBeaver แล้วรัน:

```text
dotwatch-backend/db-security/monitoring/db_health_check.sql
```

ผลที่ควรเห็น:
- `convalidated=false` ควรไม่มี row
- orphan/mismatch `issue_count` ควรเป็น 0
- index สำคัญควรแสดงครบ
- database size ดูสมเหตุสมผล

## 6. Manual Web Test

ทดสอบบนหน้าเว็บ:
- Login
- Dashboard โหลด Device
- Device Map realtime
- Devices เปิด Metric Config ได้
- Create Device ได้
- Reset Device Secret ได้
- History โหลดกราฟ/table ได้
- Alarm Rules เพิ่ม/แก้/ลบได้
- Raspberry Pi ส่งค่าจริงเข้า backend ได้

## 7. Backup

ตั้ง backup อย่างน้อยวันละครั้ง หรือก่อน migration ทุกครั้ง:

```powershell
$env:DATABASE_URL="postgresql://..."
.\dotwatch-backend\db-security\scripts\backup-dotwatch.ps1
```

## 8. จุดที่ต้องระวังต่อ

- อย่าเปิด `/api/demo` ใน production
- อย่าเปิด CORS กว้าง
- อย่าส่ง device secret ใน frontend หลังสร้างเสร็จ
- อย่าเก็บ Firebase private key ใน repo
- เปลี่ยน device secret ทันทีถ้าสงสัยว่าหลุด
