# dotWatch Weather API Virtual Device

ฟีเจอร์นี้เพิ่ม Model `Weather API Demo` (`weather_api_demo`) เพื่อให้ Backend ดึงค่าอุณหภูมิและความชื้นจาก Open-Meteo โดยไม่ต้องใช้ ESP32

## การทำงาน

1. สร้าง Device ด้วย Model `Weather API Demo`
2. กำหนด Latitude และ Longitude ใน Location ของ Device
3. Backend Scheduler ตรวจหา Device ที่ถึงรอบ Poll
4. Backend เรียก Open-Meteo Current Weather
5. ค่า `temperature` และ `humidity` ถูกส่งผ่าน Ingest pipeline เดิม
6. ระบบอัปเดต History, Latest Value, Alarm, Activity และ WebSocket

ค่าจาก Weather API เป็นข้อมูลสภาพอากาศตามพิกัด ไม่ใช่ค่าจากเซนเซอร์ที่ติดตั้ง ณ จุดจริง

## Environment Variables บน Render Backend

```env
WEATHER_VIRTUAL_DEVICE_ENABLED=true
WEATHER_SCHEDULER_ENABLED=true
WEATHER_POLL_SECRET=<random-secret-at-least-32-characters>
WEATHER_SCHEDULER_TICK_SECONDS=60
WEATHER_SCHEDULER_INITIAL_DELAY_MS=5000
WEATHER_FETCH_TIMEOUT_MS=10000
WEATHER_POLL_BATCH_SIZE=25
WEATHER_POLL_CONCURRENCY=4
```

สร้าง Secret ใน PowerShell:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`WEATHER_SCHEDULER_TICK_SECONDS` คือความถี่ที่ Scheduler ตรวจหา Device ที่ถึงรอบ ไม่ใช่รอบบันทึกของแต่ละ Device

ค่าเริ่มต้นของ Weather Device คือ Poll ทุก 600 วินาที โดยเก็บในตาราง `weather_virtual_devices`

## Migration

```powershell
Set-Location "D:\IoT Project\dotwatch"
$env:DATABASE_URL = "<Render External Database URL>"
npm run backend:migrate
```

Migration จะเพิ่ม:

- Model `Weather API Demo`
- Values `temperature` และ `humidity`
- ตาราง `weather_virtual_devices`
- Poll interval เริ่มต้น 600 วินาที

## สร้าง Device

ใน Dashboard:

1. เปิดหน้า Devices
2. เลือก Create Device
3. เลือก Model `Weather API Demo`
4. สร้าง Device
5. เปิด Device Settings และกำหนด Location/พิกัด

Device ที่ยังไม่มี Latitude/Longitude จะไม่ถูก Poll และยังคง Offline

## Poll ทันทีเพื่อทดสอบ

ตั้ง Environment ชั่วคราวใน PowerShell:

```powershell
Set-Location "D:\IoT Project\dotwatch"
$env:BACKEND_URL = "https://<your-backend>.onrender.com"
$env:WEATHER_POLL_SECRET = "<same-secret-as-render>"
npm run backend:weather:poll
```

หรือเรียก endpoint โดยตรง:

```powershell
$Headers = @{
  Authorization = "Bearer <WEATHER_POLL_SECRET>"
  "Content-Type" = "application/json"
}

Invoke-RestMethod `
  -Method Post `
  -Uri "https://<your-backend>.onrender.com/api/internal/weather/poll" `
  -Headers $Headers `
  -Body '{"force":true}'
```

ผลลัพธ์ที่ผ่าน:

```json
{
  "ok": true,
  "data": {
    "enabled": true,
    "selected": 1,
    "unconfigured": 0,
    "ingested": 1,
    "skippedDuplicate": 0,
    "failed": 0
  }
}
```

หาก Open-Meteo ส่ง observation time เดิม ระบบจะไม่เพิ่ม History ซ้ำ แต่จะอัปเดต heartbeat เพื่อให้สถานะ Device สะท้อนว่าการเชื่อมต่อ Provider ยังทำงานอยู่

## Online / Warning / Offline

Weather Device ใช้ threshold ตาม Poll interval:

- Warning: ไม่มี heartbeat เกิน `2 × poll_interval_seconds`
- Offline: ไม่มี heartbeat เกิน `3 × poll_interval_seconds`

และจะไม่ต่ำกว่า threshold กลางของระบบ

สำหรับค่าเริ่มต้น 600 วินาที:

- Warning หลังประมาณ 20 นาที
- Offline หลังประมาณ 30 นาที

## เปลี่ยน Poll Interval

ช่วงที่รองรับคือ 60–86400 วินาที:

```sql
UPDATE weather_virtual_devices
SET poll_interval_seconds = 600,
    updated_at = NOW()
WHERE device_id = <DEVICE_ID>;
```

## ตรวจสอบสถานะในฐานข้อมูล

```sql
SELECT
  d.id,
  d.device_code,
  d.name,
  d.status,
  d.latitude,
  d.longitude,
  w.enabled,
  w.poll_interval_seconds,
  w.last_attempt_at,
  w.last_success_at,
  w.last_observed_at,
  w.consecutive_failures,
  w.last_error
FROM weather_virtual_devices w
JOIN devices d ON d.id = w.device_id
ORDER BY d.id;
```

## การปิดฟีเจอร์

```env
WEATHER_VIRTUAL_DEVICE_ENABLED=false
```

การปิดฟีเจอร์ไม่ลบ Device, History หรือการตั้งค่าเดิม
