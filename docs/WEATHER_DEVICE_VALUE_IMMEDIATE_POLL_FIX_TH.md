# Weather API Demo: Immediate Value Fix

วันที่: 2026-07-16

## ปัญหา

หลังสร้าง Device รุ่น `Weather API Demo` ค่า Temperature และ Humidity ยังไม่ขึ้นทันที เนื่องจาก Dashboard เดิมสร้าง Device ก่อน แล้วจึงส่งพิกัดด้วยคำขอแยกอีกครั้ง ขณะที่ Backend จะรอ Scheduler รอบถัดไปและไม่สั่ง Weather Poll หลังบันทึกพิกัด

## การแก้ไข

1. Dashboard ส่ง `latitude` และ `longitude` พร้อมคำขอ Create Device ตั้งแต่ครั้งแรก
2. Weather API Demo บังคับให้เลือก Location ก่อนกด Next
3. Backend สั่ง Poll แบบ `force` ทันทีหลังสร้าง Weather Device ที่มีพิกัด
4. Backend สั่ง Poll ทันทีเมื่อแก้ไข Location ของ Weather Device เดิม
5. Dashboard แสดงผล Poll ที่ชัดเจน ได้แก่ สำเร็จ, ปิด Feature, ไม่มีพิกัด หรือ Weather API ล้มเหลว
6. หาก Poll ล้มเหลวหลังสร้าง Device ระบบยังคงเก็บ Device ไว้และส่งสาเหตุให้ Dashboard แสดง ไม่ทำให้เกิด Device ซ้ำจากการกดสร้างใหม่

## Environment ที่ต้องมีบน Render Backend

```env
WEATHER_VIRTUAL_DEVICE_ENABLED=true
WEATHER_SCHEDULER_ENABLED=true
WEATHER_POLL_SECRET=<secret อย่างน้อย 32 ตัวอักษร>
WEATHER_SCHEDULER_TICK_SECONDS=60
WEATHER_SCHEDULER_INITIAL_DELAY_MS=5000
WEATHER_FETCH_TIMEOUT_MS=10000
WEATHER_POLL_BATCH_SIZE=25
WEATHER_POLL_CONCURRENCY=4
```

หลังแก้ Environment ให้กด Manual Deploy หรือ Restart Backend

## ทดสอบ Device เดิมทันที

ตั้งค่า URL และ Secret จริงใน PowerShell:

```powershell
Set-Location "D:\IoT Project\dotwatch"

$env:BACKEND_URL = "https://<backend-name>.onrender.com"
$env:WEATHER_POLL_SECRET = "<WEATHER_POLL_SECRET จริง>"

npm run backend:weather:poll
```

ผลที่ผ่านควรมี:

```json
{
  "ok": true,
  "data": {
    "enabled": true,
    "ingested": 1,
    "failed": 0
  }
}
```

หาก `unconfigured` มากกว่า 0 ให้เปิด Device แล้วเลือก Latitude/Longitude จากแผนที่ จากนั้นกด Save Location อีกครั้ง

หาก `enabled` เป็น `false` ให้ตั้ง `WEATHER_VIRTUAL_DEVICE_ENABLED=true` บน Render

หาก `failed` มากกว่า 0 ให้ดู `data.results[0].error` และ Render Logs

## ตรวจสอบฐานข้อมูล

```sql
SELECT
  d.id,
  d.device_code,
  d.name,
  d.status,
  d.latitude,
  d.longitude,
  w.enabled,
  w.last_attempt_at,
  w.last_success_at,
  w.last_observed_at,
  w.consecutive_failures,
  w.last_error
FROM weather_virtual_devices w
JOIN devices d ON d.id = w.device_id
ORDER BY d.id DESC;
```

ตรวจสอบค่าล่าสุด:

```sql
SELECT
  d.device_code,
  l.metric_key,
  l.value,
  l.time
FROM device_metric_latest l
JOIN devices d ON d.id = l.device_id
WHERE d.device_code = '<DEVICE_CODE>'
ORDER BY l.metric_key;
```

## การตรวจสอบโค้ด

ผ่านการตรวจสอบ:

```text
node --check services/backend/src/controllers/devices.controller.js
npm run check:backend
npm run test:weather
npm run dashboard:build
```

ไม่ได้ทดสอบ Poll กับ Render Database และ Open-Meteo จริงจากสภาพแวดล้อมจัดทำไฟล์ เนื่องจากไม่มี Credential ของระบบผู้ใช้และ DNS ภายนอกใน Runtime ทดสอบไม่พร้อม
