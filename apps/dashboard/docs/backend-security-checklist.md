# dotWatch Backend Security Checklist

ใช้ checklist นี้กับ backend patch รอบถัดไป

## API Auth

ทุก endpoint dashboard ต้องมี middleware:

```text
Authorization: Bearer <Firebase ID Token>
```

Endpoint ที่ต้องล็อก:

```text
GET    /api/devices
POST   /api/devices
GET    /api/devices/:id
PUT    /api/devices/:id
DELETE /api/devices/:id
POST   /api/devices/:id/reset-secret
GET    /api/devices/:id/history
GET    /api/devices/:id/metrics
PUT    /api/devices/:id/metrics
POST   /api/devices/:id/metrics/reset
GET    /api/alarms
POST   /api/alarms/:id/acknowledge
GET    /api/alarm-rules
POST   /api/alarm-rules
PUT    /api/alarm-rules/:id
DELETE /api/alarm-rules/:id
GET    /api/activity
```

## User Isolation

ทุก query ต้องกัน user ข้ามบัญชี:

```sql
WHERE devices.user_id = $current_user_id
```

ห้ามใช้แค่ device_id อย่างเดียว

## Device Ingest Security

```text
- device_code + device_secret
- เก็บ secret เป็น hash เท่านั้น
- reset secret แล้ว secret เก่าต้องใช้ไม่ได้ทันที
- failed auth เกินจำนวนที่กำหนดให้ lock ชั่วคราว
```

## Audit Log

ควร log action:

```text
create_device
rename_device
delete_device
reset_device_secret
update_device_location
create_alarm_rule
update_alarm_rule
delete_alarm_rule
acknowledge_alarm
export_history
```

## Database Columns ที่ควรมี

```sql
ALTER TABLE devices ADD COLUMN IF NOT EXISTS last_secret_rotated_at timestamptz;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS failed_auth_count integer DEFAULT 0;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS last_failed_auth_at timestamptz;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS locked_until timestamptz;
```
