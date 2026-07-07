# dotWatch Phase 4 - Data Scale & Performance

Phase 4 ทำให้ backend/database รองรับ telemetry จำนวนมากขึ้น โดยไม่รื้อ UI หลักและไม่เปลี่ยน payload เดิมของ Raspberry Pi/Device ที่ส่งอยู่แล้ว

## ติดตั้ง

แตกไฟล์ `dotwatch-phase4-data-scale-performance.zip` แล้ว copy โฟลเดอร์ `dotwatch` ไปวางทับโปรเจกต์เดิม

```powershell
cd "D:\IoT Project\dotwatch"
npm run verify:phase4
```

จากนั้นรัน migration:

```powershell
npm run backend:migrate
```

ถ้าใช้ Render ให้ตั้ง Pre-Deploy Command เป็น:

```bash
npm run migrate
```

ใน service `services/backend` หรือคำสั่งที่คุณใช้ deploy backend อยู่ตอนนี้

## สิ่งที่ Phase 4 เพิ่ม

### 1. Latest metric lookup table

เพิ่มตาราง:

```text
device_metric_latest
```

ตารางนี้เก็บค่าล่าสุดของแต่ละ device/metric เช่น:

```text
DW-xxxxx / metric_1 / latest value
DW-xxxxx / metric_2 / latest value
...
```

ผลลัพธ์คือหน้า Dashboard และ Devices ไม่ต้องค้น latest จาก `device_metric_readings` ทั้งก้อนทุกครั้ง ทำให้โหลดเร็วขึ้นเมื่อข้อมูล history เริ่มเยอะ

### 2. Batch insert สำหรับ ingest

`POST /api/ingest` ยังใช้ได้เหมือนเดิม แต่ข้างในเปลี่ยนจาก insert ทีละ metric เป็น insert หลาย metric ใน query เดียว

เพิ่ม endpoint ใหม่:

```text
POST /api/ingest/batch
```

เหมาะกับ offline queue หรือ gateway ที่ต้องส่ง reading หลายชุดกลับมาหลังเน็ตหลุด

### 3. Raspberry Pi offline queue flush แบบ batch

Pi Agent จะ flush queue ไปที่ `/api/ingest/batch` ได้ เมื่อมีข้อมูลค้างหลายรายการ

เพิ่ม env:

```text
QUEUE_FLUSH_BATCH_ENABLED=true
```

### 4. History query ใช้ aggregate อัตโนมัติ

History endpoint รองรับ query เพิ่ม:

```text
resolution=auto|raw|1m|5m|15m|1h|1d
limit=5000
```

ค่า default คือ `auto`

แนวคิด:

- ช่วงสั้น ใช้ raw data
- ช่วงยาว ใช้ continuous aggregate 1m/1h/1d
- ถ้า aggregate ยังไม่พร้อม จะ fallback ไป raw bucket query แทน

### 5. Performance report

หลัง backend/database พร้อมแล้ว รัน:

```powershell
npm run report:backend-performance
```

ใช้ดูขนาด table, latest coverage, ingest volume, Timescale aggregate และ chunk size

## Smoke test batch ingest

เมื่อ backend รันอยู่และมี device code/secret แล้ว ใช้:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/backend-ingest-batch-test.ps1 `
  -BaseUrl "https://dotwatch-backend.onrender.com" `
  -DeviceCode "DW-xxxx" `
  -DeviceSecret "PASTE_DEVICE_SECRET_HERE"
```

คำสั่งนี้จะส่ง 2 readings เข้า `/api/ingest/batch`

## Env ใหม่ใน backend

```text
INGEST_MAX_METRICS_PER_READING=64
INGEST_BATCH_MAX_READINGS=120
HISTORY_RAW_MAX_HOURS=36
HISTORY_MAX_ROWS=5000
HISTORY_USE_CONTINUOUS_AGGREGATES=true
```

สำหรับ Raspberry Pi:

```text
QUEUE_FLUSH_BATCH_ENABLED=true
```

## เอกสารละเอียด

อ่านต่อที่:

```text
docs/PHASE_4_DATA_SCALE_PERFORMANCE.md
docs/DATA_RETENTION_AND_SCALE_PLAN.md
```
