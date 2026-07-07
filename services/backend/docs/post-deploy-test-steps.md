# dotWatch Post-Deploy Test Steps

## หลัง deploy backend ใหม่

### 1. ตรวจ backend

```powershell
Invoke-RestMethod https://dotwatch-backend.onrender.com/health
```

ควรได้:

```json
{
  "ok": true,
  "service": "dotwatch-backend"
}
```

Production ไม่ควรแสดงรายละเอียด WebSocket clients/byUser

### 2. ตรวจ protected API

ไม่แนบ token ต้องโดน block:

```powershell
Invoke-WebRequest https://dotwatch-backend.onrender.com/api/devices
```

ควรได้ HTTP 401

### 3. ตรวจ ingest

ไม่แนบ device secret ต้องโดน block:

```powershell
Invoke-WebRequest `
  -Uri https://dotwatch-backend.onrender.com/api/ingest `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"metrics":{"metric_1":30}}'
```

ควรได้ HTTP 401

### 4. ตรวจ frontend

เปิด:

```text
https://dotwatch.onrender.com
```

เช็ค:
- Login ได้
- Dashboard มี realtime
- Devices โหลดได้
- History โหลดได้

### 5. ตรวจ Raspberry Pi

ดู backend logs ว่ามี ingest เข้า และ device เปลี่ยนเป็น online

### 6. ตรวจ Database

รัน:

```text
dotwatch-backend/db-security/monitoring/db_health_check.sql
```

ทุก issue_count ควรเป็น 0
