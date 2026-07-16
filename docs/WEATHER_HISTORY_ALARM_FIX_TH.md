# dotWatch Weather / History / Alarm Rules Fix

วันที่: 2026-07-16

## รายการแก้ไข

### 1. Weather API Demo บันทึกทุก 1 นาที

- เปลี่ยนค่าเริ่มต้น `poll_interval_seconds` จาก 600 เป็น 60 วินาที
- Migration `024_weather_api_virtual_devices.sql` จะปรับ Weather Virtual Device เดิมทั้งหมดเป็น 60 วินาทีเมื่อรันซ้ำ
- ทุกครั้งที่ Backend Poll สำเร็จ จะบันทึก Snapshot ใหม่โดยใช้เวลาของ Backend เป็น `timestamp`
- เก็บเวลาจาก Open-Meteo แยกไว้ที่ `last_observed_at`
- แม้ Open-Meteo ส่งค่าเดิม Backend ยังสร้าง History รอบใหม่ทุก 1 นาที
- ค่า Temperature/Humidity อาจเท่าเดิมหลายรอบได้ เนื่องจากข้อมูลต้นทางไม่ได้เปลี่ยนทุกนาที แต่เวลาใน History และ Latest Update จะเปลี่ยนทุก Poll

### 2. History Table Sort

- เรียงลำดับหลังรวมข้อมูล All Values แล้ว
- ใช้ตัวเรียงเดียวกันสำหรับ All Values และ Value รายตัว
- `ล่าสุด` เรียงเวลามากไปน้อย
- `เก่าสุด` เรียงเวลาน้อยไปมาก
- เปลี่ยน Sort แล้วกลับไปหน้า 1 ทันที

### 3. Alarm Rules

ตาราง Alarm Rules เหลือคอลัมน์:

- Device
- Value
- Condition
- Severity

เอา `Status` และ `Created` ออกจาก Alarm Rules โดยไม่กระทบ Status ของ Alarm Events

## หลังติดตั้ง

รัน Migration กับ Render PostgreSQL:

```powershell
$env:DATABASE_URL = 'Render External Database URL จริง'
npm run backend:migrate
```

ผลควรมี:

```text
OK SQL file: 024_weather_api_virtual_devices.sql
dotWatch migration completed
```

ตั้ง Render Environment:

```env
WEATHER_VIRTUAL_DEVICE_ENABLED=true
WEATHER_SCHEDULER_ENABLED=true
WEATHER_SCHEDULER_TICK_SECONDS=60
```

จากนั้น Deploy Backend และ Dashboard ใหม่
