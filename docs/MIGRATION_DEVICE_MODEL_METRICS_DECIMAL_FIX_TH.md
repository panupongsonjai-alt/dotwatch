# แก้ Migration: device_model_metrics.decimal_places

## อาการ

Migration หยุดด้วย PostgreSQL error `42703`:

```text
column "decimal_places" of relation "device_model_metrics" does not exist
```

## สาเหตุ

ฐานข้อมูลเดิมมีตาราง `device_model_metrics` ที่สร้างก่อนเพิ่มฟิลด์ `decimal_places` ขณะที่คำสั่ง `CREATE TABLE IF NOT EXISTS` จะไม่เติมคอลัมน์ที่ขาดในตารางที่มีอยู่แล้ว จากนั้นขั้นตอน Seed พยายาม INSERT ค่า `decimal_places` จึงล้มเหลว

## การแก้ไข

`services/backend/migrations/run.js` จะทำ Schema Compatibility ก่อน Seed ดังนี้:

1. เพิ่ม `decimal_places` เมื่อยังไม่มี
2. ปรับค่า NULL หรือค่านอกช่วง 0–6 ให้เป็น 2
3. ตั้งค่าเริ่มต้นเป็น 2
4. บังคับ `NOT NULL`

การเปลี่ยนแปลงนี้เป็นแบบ idempotent จึงรัน Migration ซ้ำได้

## รัน Migration อีกครั้ง

เปิด PowerShell ที่ Repo และตรวจสอบว่า `DATABASE_URL` เป็น Render External Database URL จริง:

```powershell
Set-Location "D:\IoT Project\dotwatch"

npm run backend:migrate
```

ผลสำเร็จควรมีอย่างน้อย:

```text
OK SQL file: 024_weather_api_virtual_devices.sql
dotWatch migration completed
```

Migration ที่ผ่านไปก่อนหน้าอาจแสดง `OK` ซ้ำ ซึ่งเป็นปกติเพราะคำสั่งถูกออกแบบให้รันซ้ำได้
