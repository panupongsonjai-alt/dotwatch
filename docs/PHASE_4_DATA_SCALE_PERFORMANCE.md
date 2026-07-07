# Phase 4 - Data Scale & Performance

## เป้าหมาย

Phase 4 เน้นแก้คอขวดก่อนขยายไปหลาย device:

1. ลดจำนวน query ตอน ingest
2. ลดภาระหน้า Dashboard/Devices ในการหา latest metrics
3. เตรียม history query สำหรับข้อมูลยาวหลายวัน/หลายเดือน
4. เพิ่มเครื่องมือตรวจขนาด database และ Timescale jobs

## Backend ingest changes

### ก่อน Phase 4

`POST /api/ingest` insert dynamic metrics แบบ loop ทีละ metric:

```text
20 metrics = 20 INSERT queries
```

ถ้า device ส่งทุก 10 วินาที และมี 20 metrics จะเกิด query จำนวนมากโดยไม่จำเป็น

### หลัง Phase 4

`POST /api/ingest` ใช้ `unnest()` เพื่อ insert หลาย metric ใน query เดียว:

```text
20 metrics = 1 INSERT query + 1 latest upsert query
```

นอกจากนี้ยัง upsert ค่า latest เข้า:

```text
device_metric_latest
```

## Batch ingest endpoint

เพิ่ม:

```text
POST /api/ingest/batch
```

Headers เหมือน endpoint เดิม:

```text
x-device-code: DW-xxxxx
x-device-secret: ********
```

Body:

```json
{
  "firmwareVersion": "rpi-agent-0.2.0",
  "readings": [
    {
      "timestamp": "2026-07-07T01:00:00.000Z",
      "metrics": {
        "metric_1": 24.8,
        "metric_2": 51.2
      }
    }
  ]
}
```

Batch endpoint ใช้สำหรับ offline queue เป็นหลัก จึง broadcast realtime/alarm จาก reading ล่าสุดของ batch เท่านั้น เพื่อลด spam บน Dashboard

## Latest metric table

ตารางใหม่:

```sql
CREATE TABLE device_metric_latest (
  device_id BIGINT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  metric_key TEXT NOT NULL,
  time TIMESTAMPTZ NOT NULL,
  value DOUBLE PRECISION NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (device_id, metric_key)
);
```

ประโยชน์:

- `listDevices` อ่าน latest metrics จาก table เล็ก
- ไม่ต้อง `DISTINCT ON` จาก hypertable ใหญ่ทุกครั้ง
- Dashboard โหลดเร็วขึ้นเมื่อ history โต

## History query strategy

Endpoint เดิมยังใช้ได้:

```text
GET /api/devices/:id/history?date=2026-07-07&metricKey=metric_1
```

เพิ่ม optional query:

```text
resolution=auto|raw|1m|5m|15m|1h|1d
limit=5000
```

ค่า `auto` เลือกแบบนี้:

| ช่วงเวลา | Source |
|---|---|
| <= `HISTORY_RAW_MAX_HOURS` | raw `device_metric_readings` |
| > raw threshold ถึง 30 วัน | `device_metric_readings_1m` |
| > 30 วัน ถึง 180 วัน | `device_metric_readings_1h` |
| > 180 วัน | `device_metric_readings_1d` |

ถ้า continuous aggregate ยังไม่พร้อม backend จะ fallback ไป raw bucket query และใส่ header:

```text
x-dotwatch-history-source: raw-fallback
```

## Migration

Phase 4 เพิ่ม:

```text
services/backend/migrations/016_phase4_data_scale_performance.sql
```

และเพิ่ม logic ใน:

```text
services/backend/migrations/run.js
```

ดังนั้นคำสั่งหลักยังเหมือนเดิม:

```powershell
npm run backend:migrate
```

## Commands

ตรวจไฟล์ Phase 4:

```powershell
npm run verify:phase4
```

รายงาน performance:

```powershell
npm run report:backend-performance
```

ทดสอบ batch ingest:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/backend-ingest-batch-test.ps1 `
  -BaseUrl "http://localhost:4000" `
  -DeviceCode "DW-xxxx" `
  -DeviceSecret "PASTE_DEVICE_SECRET_HERE"
```

## ข้อควรระวัง

- ต้องรัน migration ก่อน deploy backend code ที่ใช้ `device_metric_latest`
- Continuous aggregate อาจยังไม่มีข้อมูลย้อนหลังจนกว่าจะ refresh หรือมี policy job ทำงาน
- ถ้ามีข้อมูลเก่าเยอะมาก การ refresh aggregate ย้อนหลังควรทำช่วง maintenance window
