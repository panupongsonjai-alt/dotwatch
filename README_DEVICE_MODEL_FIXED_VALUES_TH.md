# dotWatch — Fixed Device Model Values

อัปเดตนี้ใช้กับไฟล์ฐาน `dotwatch-clean-20260721-224341.zip`

## ผลลัพธ์

### 1. `esp32_dht3`

- ชื่อที่แสดง: `dot-TH-W1`
- เก็บ Model Key ภายในเป็น `esp32_dht3` เพื่อให้ Firmware และ OTA เดิมทำงานต่อ
- มีเพียง 2 Value:
  1. `Temperature` — `°C` — Icon `Thermometer`
  2. `Humidity` — `%RH` — Icon `Droplets`

### 2. `weather_api_demo`

- ชื่อที่แสดง: `dot-WT-W1`
- เก็บ Model Key ภายในเป็น `weather_api_demo` เพื่อให้ Weather Polling เดิมทำงานต่อ
- มีเพียง 2 Value:
  1. `Temperature` — `°C` — Icon `Thermometer`
  2. `Humidity` — `%RH` — Icon `Droplets`

## การล็อกที่เพิ่ม

- Admin ไม่แสดงปุ่ม Add Value และ Remove สำหรับสองโมเดลนี้
- Dashboard ไม่แสดงปุ่ม Add Value และ Delete Value สำหรับอุปกรณ์สองโมเดลนี้
- Model Name, Model Key, Value Name, Value Type, Unit และ Icon ของโมเดลที่ล็อกแก้ไขไม่ได้
- Backend บังคับโครงสร้างเดิมแม้เรียก API โดยตรง
- Endpoint ลบ Value จะตอบกลับ `409` สำหรับอุปกรณ์สองโมเดลนี้
- Visible/Hidden, Decimal และ Alarm Rules ยังตั้งค่าได้
- Migration จะเพิ่ม Value ที่หาย ลบ Value ส่วนเกิน และแก้ชื่อ/หน่วย/Icon ของอุปกรณ์เดิม

## ตรวจสอบไฟล์ก่อน Deploy

เปิด PowerShell ที่โปรเจกต์:

```powershell
cd "D:\IoT Project\dotwatch"
node .\scripts\verify-locked-device-models.mjs
```

ผลที่ถูกต้อง:

```text
PASS: dot-TH-W1 and dot-WT-W1 are fixed to exactly two values.
PASS: Value names, units, and icons are canonicalized by the backend.
PASS: Dashboard/Admin lock controls and migration wiring are present.
PASS: Modified backend JavaScript files pass node --check.
```

ตรวจ production build:

```powershell
npm --prefix apps/dashboard ci
npm --prefix apps/dashboard run build

npm --prefix apps/admin ci
npm --prefix apps/admin run build
```

## Database Migration บน Render

Migration ที่เพิ่ม:

```text
services/backend/migrations/027_locked_temperature_humidity_models.sql
services/backend/migrations/028_lock_temperature_humidity_icons.sql
```

หลัง Push และ Deploy Backend ให้เปิด **Render Dashboard > Backend Service > Shell** แล้วรันจากโฟลเดอร์ service:

```bash
npm run migrate
```

ห้ามใช้ `DATABASE_URL` ตัวอย่างหรือ placeholder ในไฟล์ `use-render-db.ps1` การรันจาก Render Shell จะใช้ Environment Variable จริงของ Backend Service

### SQL ตรวจสอบหลัง Migration

รันผ่าน DBeaver ที่เชื่อม Render PostgreSQL:

```sql
SELECT model_key, model_name, metric_count
FROM device_models
WHERE model_key IN ('esp32_dht3', 'weather_api_demo')
ORDER BY model_key;
```

ค่าที่ต้องได้:

```text
esp32_dht3      | dot-TH-W1 | 2
weather_api_demo| dot-WT-W1 | 2
```

ตรวจ Default Values:

```sql
SELECT
  dm.model_key,
  dmm.metric_key,
  dmm.default_name,
  dmm.default_unit,
  dmm.default_icon,
  dmm.sort_order
FROM device_model_metrics dmm
JOIN device_models dm ON dm.id = dmm.model_id
WHERE dm.model_key IN ('esp32_dht3', 'weather_api_demo')
ORDER BY dm.model_key, dmm.sort_order;
```

ตรวจว่าอุปกรณ์เดิมไม่มีจำนวน Value ผิดจาก 2:

```sql
SELECT
  d.id,
  d.device_code,
  dm.model_key,
  COUNT(cfg.id) AS value_count
FROM devices d
JOIN device_models dm ON dm.id = d.model_id
LEFT JOIN device_metrics cfg ON cfg.device_id = d.id
WHERE dm.model_key IN ('esp32_dht3', 'weather_api_demo')
  AND d.is_active = TRUE
GROUP BY d.id, d.device_code, dm.model_key
HAVING COUNT(cfg.id) <> 2;
```

ผลที่ถูกต้องคือ `0 rows`

## ทดสอบผ่านหน้าเว็บ

### กรณีผ่าน

1. Admin > Device Models
2. เลือก `dot-TH-W1`
3. ต้องเห็น `Fixed 2 Values`
4. ต้องมี Temperature `°C` / `Thermometer` และ Humidity `%RH` / `Droplets` เท่านั้น
5. ไม่มี Add Value และ Remove
6. เลือก `dot-WT-W1` และตรวจแบบเดียวกัน
7. Dashboard > Devices > เลือกอุปกรณ์ > Values & Alarms
8. ไม่มี Add Value และ Delete Value
9. Value Name, Unit และ Icon แก้ไม่ได้
10. Display, Decimal และ Alarm ยังแก้และ Save ได้

### กรณีไม่ผ่าน

- ยังเห็นชื่อเก่า: ตรวจว่า `npm run migrate` บน Render ผ่านแล้ว และ Backend deploy จาก commit ล่าสุด
- ยังมี Value เกิน 2: รัน migration อีกครั้งได้อย่างปลอดภัย แล้วตรวจ SQL `value_count`
- Weather ไม่ส่งค่า: Model Key ต้องยังเป็น `weather_api_demo`; อย่าเปลี่ยนเป็นชื่อแสดงผล
- ESP32/OTA ไม่ตรงรุ่น: Model Key ต้องยังเป็น `esp32_dht3`; Firmware ใช้ชื่อแสดงผล `dot-TH-W1` แต่ OTA ใช้ key เดิม

## ทดสอบการบังคับ Icon ผ่าน API

ตัวตรวจสอบจะจำลองการส่ง Icon อื่น เช่น `Gauge` เข้า Backend policy และต้องได้ผลกลับเป็น:

```text
Temperature -> Thermometer
Humidity    -> Droplets
```

ดังนั้นแม้มีการเรียก API โดยตรง ระบบจะไม่เก็บ Icon อื่นสำหรับสองโมเดลนี้
