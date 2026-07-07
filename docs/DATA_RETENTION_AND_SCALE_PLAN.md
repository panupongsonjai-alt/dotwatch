# dotWatch Data Retention and Scale Plan

## ปัญหาที่ต้องคุม

ถ้าใช้รูปแบบ 1 metric = 1 row:

```text
1,000 devices x 20 metrics x ทุก 10 วินาที
= 2,000 rows/second
= 172.8 ล้าน rows/day
```

ดังนั้นการเก็บ raw ทุก 10 วินาทีครบ 1 ปีสำหรับทุก metric จะใช้ database ใหญ่มาก และไม่เหมาะกับ PostgreSQL/Render plan ขนาดเล็ก

## Strategy ที่แนะนำ

### Stage A - Current MVP

เหมาะกับช่วงทดสอบ/ลูกค้าน้อย:

```text
Raw metric rows: 30-90 วัน
1 minute aggregate: 180 วัน
1 hour aggregate: 1-2 ปี
1 day aggregate: 3-5 ปี
```

### Stage B - Production 100+ devices

```text
Raw metric rows: 14-30 วัน
1 minute aggregate: 90-180 วัน
1 hour aggregate: 1-2 ปี
1 day aggregate: 5 ปี
```

### Stage C - Production 1,000 devices

```text
Raw metric rows: 7-14 วัน
1 minute aggregate: 30-90 วัน
1 hour aggregate: 1-2 ปี
1 day aggregate: 5 ปี
```

## Backend env ที่เกี่ยวข้อง

```text
HISTORY_RAW_MAX_HOURS=36
HISTORY_MAX_ROWS=5000
HISTORY_USE_CONTINUOUS_AGGREGATES=true
```

## Database object ที่เพิ่มใน Phase 4

```text
device_metric_latest
```

ใช้สำหรับ latest value บน Dashboard/Device List

```text
device_metric_readings_1m
device_metric_readings_1h
device_metric_readings_1d
```

ใช้สำหรับ history chart ระยะยาว

## สิ่งที่ควรทำในเฟสถัดไป

1. เพิ่ม retention policy ที่ตั้งค่าผ่าน env หรือ migration เฉพาะ production
2. เพิ่ม telemetry load test 10/100/1,000 devices
3. เพิ่ม dashboard/admin สำหรับดู database size และ ingest rate
4. เพิ่ม adaptive sampling หรือ device-side send interval policy
5. พิจารณา payload storage แบบ JSONB ต่อ timestamp ถ้าต้องลด row count ระดับใหญ่
