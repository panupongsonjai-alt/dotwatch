# dotWatch — รายงานตรวจสอบและปรับปรุงประสิทธิภาพ ฉบับที่ 2 (Full Audit)

- วันที่ตรวจ: 2026-10-22 (ฉบับแรก 2026-10-20)
- ฐานโค้ด: `dotwatch-clean-20260721-224341.zip` (869 ไฟล์) แล้ว rebase ให้ตรงกับ GitHub `main` ล่าสุด (`85b4e78`, 2026-07-23) ซึ่งมีงาน locked model dot-TH-W1 / dot-WT-W1 เพิ่มเข้ามา
- ขอบเขต: ทั้งระบบ — Backend, Database, Dashboard/Admin, Mobile, Raspberry Pi agent, ESP32/ESP8266, OTA server, สคริปต์และเวิร์กโฟลว์
- ฉบับนี้ตรวจใหม่ทั้งโปรเจกต์ตั้งแต่ต้น รีวิวการแก้ไขของฉบับแรกซ้ำอีกรอบ แล้วเพิ่มการแก้ไขใหม่ 17 รายการ

---

## 1. สรุปสั้น

| | จำนวน |
|---|---|
| การแก้ไขในโค้ด | 39 รายการ (ฉบับแรก 21 + ฉบับนี้ 18) — รายการที่ระบุ *(ใหม่)* คือของฉบับนี้ |
| ข้อเสนอแนะที่ยังไม่ได้แก้ | 12 ข้อ (หัวข้อ 6) |
| ไฟล์ที่เปลี่ยน/เพิ่ม | 57 ไฟล์ (แก้ไข 50, เพิ่มใหม่ 7) |
| ผลการทำงานเทียบกับโค้ดเดิม | ตรงกันทุกข้อ ยกเว้นจุดที่ตั้งใจแก้ |

**ปัญหาร้ายแรงที่สุด 3 ข้อ**

1. **Backend ค้างทั้งระบบเมื่อมีอุปกรณ์ส่งข้อมูลพร้อมกันประมาณ 10 ตัวขึ้นไป** (connection pool deadlock) ต้อง restart ถึงจะกลับมา
2. **ทุก API request เขียนฐานข้อมูล 6 ครั้ง** แม้แค่เปิดหน้าดูข้อมูล และ bcrypt ทำงานทุกครั้งที่อุปกรณ์ส่งข้อมูล
3. **รายการอุปกรณ์สแกนตารางอุปกรณ์ทั้งระบบทุกครั้ง** (ทุก tenant รวมกัน) ระบบจึงช้าลงตามจำนวนลูกค้า

### ผลวัดก่อน/หลัง

เครื่องทดสอบเดียวกัน, PostgreSQL 16, ฐานข้อมูลมีอุปกรณ์ 20,000 ตัว (1,000 tenant) และ alarm rule 4 ข้อต่ออุปกรณ์

| ตัวชี้วัด | โค้ดเดิม | หลังแก้ | ผล |
|---|---|---|---|
| Ingest (concurrency 4) | 10.9 req/s, p50 364 ms | 245 req/s, p50 16 ms | **เร็วขึ้น ~22 เท่า** |
| Ingest พร้อมกัน 12–20 request | **ค้างทั้งระบบ** | 256 req/s, error 0 | แก้ deadlock |
| รายการอุปกรณ์ `GET /api/devices` | 38 req/s, p50 102 ms | 408 req/s, p50 9 ms | **เร็วขึ้น ~11 เท่า** |
| SQL ต่อ 1 API request | 10 (เขียน 6) | 1 (เขียน 0) | −90% |
| SQL ต่อ 1 ingest | 9 | 7 | −22% |
| Query รายการอุปกรณ์ (20k อุปกรณ์) | 47 ms | 0.55 ms | ~85 เท่า |
| Insert 300,000 แถว | 8.6–10.0 s (12 index) | 3.8–4.1 s (4 index) | ~2.3 เท่า |
| ลบอุปกรณ์ (activity log 1 ล้านแถว) | 112 ms | 3–5 ms | ~25 เท่า |
| คำนวณ DB usage ของ Admin (1 ล้านแถว) | 490 ms (สแกนทุกแถว) | 204 ms (ประมาณค่า, คลาด 0.002%) | โตตามข้อมูลน้อยลงมาก |
| Log ต่อ request | ~7 บรรทัด | ~1 บรรทัด (production: ingest สำเร็จ = 0) | −85% |
| JS ที่โหลดตอนเปิด Dashboard | 147 KB gzip | 101 KB gzip | −31% |
| Pi agent: เคลียร์คิว 150 รายการ | 150 รอบ (หยุดส่งค่าสด) | 4 รอบ | ~37 เท่า |
| Modbus 20 ค่า ต่อ 1 รอบอ่าน | 20 request | 1 request | ~20 เท่า |
| `npm run export:clean` | 17.6 s | 4.5 s | ~4 เท่า |

---

## 2. วิธีตรวจ

1. อ่านโค้ดทุกส่วนใหม่ทั้งหมด ไม่ใช้ผลของฉบับแรกเป็นข้อสรุปตั้งต้น
2. รัน backend จริงกับ PostgreSQL 16 ทั้งตัวเดิมและตัวที่แก้ ด้วยข้อมูลจำลอง 20,000 อุปกรณ์ / 1 ล้านแถว telemetry / 1 ล้านแถว activity log และ index ซ้ำแบบเดียวกับ production
3. วัด throughput/latency ด้วย load test, นับ SQL ต่อ request ด้วย `pg_stat_statements`, ดูแผน query ด้วย `EXPLAIN ANALYZE`
4. เทียบผลการทำงาน (functional diff) ระหว่างโค้ดเดิมกับโค้ดใหม่ด้วยสคริปต์ชุดเดียวกัน ครอบคลุม ingest, alarm warning/critical/resolved, batch, history, value settings, reset secret และรายการอุปกรณ์
5. Unit test ส่วนที่ทดสอบกับฮาร์ดแวร์จริงไม่ได้ ได้แก่ Modbus (จำลองอุปกรณ์), คิว Pi (stale/poison/network), weather claim (SQL พร้อมกัน), retention (ข้อมูลเก่า/ใหม่)
6. build dashboard/admin, typecheck mobile, compile Pi agent และรันสคริปต์ verify เดิมทั้ง 25 ตัว (ผ่านทั้งหมด)

**ข้อจำกัด:**

- เครื่องทดสอบไม่มี TimescaleDB ส่วนที่ใช้ continuous aggregate ทดสอบด้วยตารางจำลอง
- CI job `backend-e2e` และ `npm run verify:local` รันบน TimescaleDB จริง
- ไม่ได้ทดสอบบนบอร์ด ESP32/ESP8266 จริง จึงไม่ได้แก้โค้ด firmware

---

## 3. ปัญหาที่แก้แล้ว — Backend และ Database

### 3.1 [วิกฤต] Connection pool deadlock — backend ค้างทั้งระบบ *(ฉบับแรก)*

- **ปัญหา:** ingest ยึด connection ไว้ แล้วขั้นตอน alarm/activity ขอ connection ที่สองจาก pool ซึ่งมี 10 เส้นและไม่มี timeout เมื่อมี ingest พร้อมกัน 10 request ทุกตัวถือคนละ 1 เส้นและรออีกเส้นตลอดไป (ทดสอบซ้ำได้: ที่ 12 request ทุก API ค้าง และ `/health` ขึ้น database error)
- **วิธีแก้:** ปล่อย connection ทันทีหลัง `COMMIT`, ตั้ง `max`/`idleTimeoutMillis`/`connectionTimeoutMillis`/`statement_timeout` และเพิ่ม `pool.on('error')` ใช้แนวเดียวกันกับ handler ตั้งค่า metric ทั้ง 3 ตัว
- **ไฟล์:** `db/pool.js`, `controllers/ingest.controller.js`, `controllers/deviceMetricsController.js`

### 3.2 [วิกฤต] Weather poller ถือ connection ระหว่างเรียก API ภายนอก *(ใหม่)*

- **ปัญหา:** ใช้ advisory lock แบบ session จึงต้องถือ connection ไว้ตลอดการเรียก Open-Meteo (นานสุด 10 วินาที) และระหว่างนั้น ingest ข้างในต้องใช้ connection ที่สอง เป็นรูปแบบเดียวกับข้อ 3.1 โดยใช้ 4 connection ต่อรอบ poll
- **วิธีแก้:** เปลี่ยนเป็น "claim" แบบ atomic ด้วย `UPDATE ... WHERE last_attempt_at <= ... RETURNING` ทำงานได้ถูกต้องแม้มี backend หลายตัว และไม่ถือ connection ระหว่างรอ API (ทดสอบแล้ว: poll พร้อมกัน 2 ตัว → ได้ 1 ingested กับ 1 skipped)
- **ไฟล์:** `services/weatherVirtualDevice.service.js`

### 3.3 [สูง] รายการอุปกรณ์สแกนทั้งตาราง *(ใหม่)*

- **ปัญหา:** เงื่อนไข `d.user_id = $1 OR tenant_access.user_id IS NOT NULL` ใช้ index ไม่ได้ ทุกครั้งที่เปิด Dashboard จึงอ่านอุปกรณ์ของทุกลูกค้า
- **วิธีแก้:** ใช้ subquery `UNION` (อุปกรณ์ที่เป็นเจ้าของ + อุปกรณ์ในองค์กรที่เป็นสมาชิก) ซึ่งใช้ index ได้ — query เหลือ 0.55 ms จาก 47 ms และ API เร็วขึ้น 11 เท่า สิทธิ์การเห็นอุปกรณ์เหมือนเดิมทุกกรณี
- **ไฟล์:** `services/organizationAccess.service.js`

### 3.4 [สูง] bcrypt ทำงานทุกครั้งที่อุปกรณ์ส่งข้อมูล *(ฉบับแรก)*

- **วิธีแก้:** cache ผลตรวจที่ผ่านแล้วไว้ 10 นาที โดยใช้ `sha256(hash + secret)` เมื่อรีเซ็ต secret ค่า cache ใช้ไม่ได้ทันที (ทดสอบแล้ว: secret เก่าได้ 401) ปิดได้ด้วย `DEVICE_AUTH_CACHE_TTL_MS=0`
- **ไฟล์:** `middlewares/authDevice.js`

### 3.5 [สูง] ทุก API request เขียนฐานข้อมูล 6 ครั้ง *(ฉบับแรก)*

- **วิธีแก้:** cache การเตรียมข้อมูล user/องค์กรไว้ 60 วินาที และล้าง cache ทันทีเมื่อ admin เปลี่ยน status/plan/role
- **ไฟล์:** `services/user.service.js`, `controllers/admin.controller.js`

### 3.6 [สูง] Index ซ้ำบน `device_metric_readings` *(ฉบับแรก)*

- **ปัญหา:** migration หลายไฟล์สร้าง index เดียวกันคนละชื่อ บางฐานมีถึง 12 ตัว ซึ่งซ้ำ 8 ตัว
- **วิธีแก้:** `npm run db:dedupe-indexes` (ดูรายการ) และ `:apply` (ลบจริง) ลบเฉพาะ index ที่ซ้ำ 100% และเก็บชื่อที่ `run.js` ใช้

### 3.7 [สูง] Foreign key ไม่มี index รองรับ *(ใหม่)*

- **ปัญหา:** การลบอุปกรณ์หรือ alarm rule ต้องสแกน `alarm_events` และ `activity_logs` ทั้งตาราง ซึ่งโตตลอดเวลา (activity log ได้ประมาณ 1,440 แถว/วัน/อุปกรณ์)
- **วิธีแก้:** migration สร้าง index 4 ตัวแบบ `CONCURRENTLY` (ไม่ล็อกการเขียนระหว่าง deploy) และซ่อม index ที่สร้างค้างไว้
- **ไฟล์:** `migrations/run.js`

### 3.8 [สูง] History ตัดข้อมูลล่าสุดทิ้ง *(ฉบับแรก)*

- **ปัญหา:** query เรียง `ASC LIMIT` จึงได้ข้อมูลเก่าสุดเมื่อมีแถวเกิน limit
- **วิธีแก้:** เลือกแถวล่าสุดก่อนแล้วเรียงกลับ ทุก path ทั้ง raw, bucket, legacy และ aggregate

### 3.9 [กลาง] History ยิง query ที่รู้ว่าจะ error ทุกครั้งบนฐานที่ไม่มี Timescale *(ใหม่)*

- **วิธีแก้:** จำไว้ว่ามี continuous aggregate หรือไม่ (เช็คใหม่ทุก 10 นาที) ข้าม query ที่ไม่มีทางสำเร็จ และไม่เขียน warning ทุก request

### 3.10 [กลาง] การคำนวณ DB usage ของ Admin สแกน telemetry ทุกแถว *(ใหม่)*

- **ปัญหา:** ใช้ `pg_column_size()` ทุกแถวทุก 6 ชั่วโมง (และทุกครั้งที่มี user ใหม่) ซึ่งต้อง decompress chunk ของ Timescale และจะชน timeout 120 s เมื่อข้อมูลโต
- **วิธีแก้:** ประมาณจากจำนวนแถวต่ออุปกรณ์ × ขนาดเฉลี่ยจาก sample 2,000 แถว จำนวนแถวใช้ aggregate รายวันถ้ามี คลาดเคลื่อน 0.002% (ไม่มี aggregate) และ +0.1% (มี aggregate)
- **ไฟล์:** `services/adminDatabaseUsage.service.js`

### 3.11 [กลาง] Retention ของแพ็กเกจไม่เคยถูกใช้จริง *(ใหม่)*

- **ปัญหา:** `plan_definitions.retention_days` (30/180/365/730 วัน) แสดงใน Admin/Billing แต่ไม่มีโค้ดลบข้อมูลเลย telemetry จึงโตไม่สิ้นสุด
- **วิธีแก้:** สคริปต์ `npm run db:retention` (dry run) และ `:apply`
  - ใช้ retention ตามแพ็กเกจของเจ้าของอุปกรณ์ หรือค่า override ขององค์กร
  - ลบทีละอุปกรณ์ ทีละวัน และไม่ลบข้อมูลที่อายุน้อยกว่า 30 วัน
  - ลบเฉพาะ telemetry กับ activity ประเภท `reading.received` (alarm event และ audit log ไม่แตะ)
  - ทดสอบแล้ว: ลบเฉพาะแถวที่เก่ากว่า 30 วันตรงตามจำนวน
- **ข้อควรรู้:** เป็นการลบข้อมูลจริง จึงไม่ทำงานอัตโนมัติ ต้องสั่งเอง (หัวข้อ 5)

### 3.12 [กลาง] Error จาก input ของผู้ใช้กลายเป็น HTTP 500 *(ใหม่)*

- **ปัญหา:** device code ซ้ำ หรือ id ใน URL ไม่ใช่ตัวเลข ทำให้ได้ 500 พร้อม stack trace ใน log
- **วิธีแก้:** แปลง error ของ Postgres เป็น 409 / 400 พร้อมข้อความที่อ่านเข้าใจได้
- **ไฟล์:** `middlewares/errorHandler.js`

### 3.13 อื่น ๆ ใน Backend

- ลบ log ที่ล้น (WS broadcast, no subscriber) และเพิ่ม `HTTP_LOG_INGEST_SUCCESS` *(ฉบับแรก)*
- ขั้นตอนหลังบันทึกที่ล้มเหลวไม่ทำให้ ingest ตอบ 500 อีกต่อไป จึงไม่มี reading ซ้ำจากการส่งซ้ำ และ activity log เขียนหลังตอบอุปกรณ์ *(ฉบับแรก)*
- Alarm อ่านและอัปเดต state ทุก metric ใน 2 query จากเดิม 2 query ต่อ metric *(ฉบับแรก)*
- Rate limit และ Firebase verify ทำงานครั้งเดียวต่อ request จากเดิม 2 ครั้งบางเส้นทาง *(ฉบับแรก)*
- Guard ไม่ให้ offline detection ทำงานซ้อน, insert ค่า metric ครั้งเดียว, ลบ `pg-boss` ที่ไม่ได้ใช้ *(ฉบับแรก)*
- แก้ `d.model_id = 5` ที่ฝังค่าตายตัว เป็นการเช็คจาก `model_key` เพราะฐานใหม่อาจได้ id อื่น *(ใหม่)*
- หน้า Values ของรุ่น locked (dot-TH-W1, dot-WT-W1) เขียนแถว `device_metrics` ใหม่ทุกครั้งที่เปิดดู (upsert 2 แถว + delete ทุก GET) ตอนนี้ข้ามการเขียนเมื่อค่าในฐานตรงกับค่ามาตรฐานอยู่แล้ว ผลลัพธ์ที่ API ตอบเหมือนเดิมทุกกรณี รวมถึงการซ่อมค่าที่ถูกแก้และลบค่าเกิน *(ใหม่, ตอน rebase)*

---

## 4. ปัญหาที่แก้แล้ว — Frontend, Mobile, Pi, เวิร์กโฟลว์

### Dashboard

- **[สูง] ทุก alarm ทำให้ Dashboard โหลดใหม่ทั้งหน้าและตัด/ต่อ WebSocket ใหม่** *(ฉบับแรกแก้แล้ว ฉบับนี้ยืนยันสาเหตุ)*
  - สาเหตุ: `useEffect([addAlarm])` ทำงานใหม่ทุกครั้งที่ `AlarmContext` สร้างฟังก์ชันใหม่
  - แก้: ทำให้ค่าใน context คงที่ (`useCallback` / `useMemo`)
- **[กลาง] รวม realtime update เป็นชุดทุก 500 ms** *(ใหม่)* — เดิม render ทั้งหน้า (การ์ดและแผนที่) ต่อทุก reading ของทุกอุปกรณ์
- **[กลาง] หยุด polling เมื่อแท็บถูกซ่อน** *(ใหม่)* — ใช้กับ History, Compare Graph และ Latest Active Alarms
- โหลดโค้ดแผนที่เฉพาะหน้าที่ใช้ (JS หน้าแรก −31%) และ throttle การแจ้งสถานะ realtime *(ฉบับแรก)*

### Mobile

- รับ event `reading` แล้วอัปเดต cache ตรงตัว เพราะเดิมค่าไม่ขยับแบบ realtime *(ฉบับแรก)* ฉบับนี้ปรับให้รวมค่าเดิมกับค่าใหม่แทนการเขียนทับ *(ใหม่)*
- History ช่วง 6h ไม่ตัดข้อมูลล่าสุด *(ฉบับแรก)*
- ตั้ง timeout 20 วินาทีให้ทุก request (เดิมค้างได้นานมากบนเน็ตมือถือ) *(ใหม่)*
- เชื่อม React Query กับ AppState: หยุด polling ตอนแอปอยู่เบื้องหลัง และรีเฟรชเมื่อกลับมา *(ใหม่)*

### Raspberry Pi agent

- ส่งคิวแบบ batch พร้อมค่าสด รักษาลำดับเวลา และ append ไฟล์แบบ O(1) *(ฉบับแรก)*
- **[สูง] คิวค้างถาวรเมื่อมีรายการที่ backend ปฏิเสธ** *(ใหม่)* — เช่นข้อมูลเก่ากว่า 7 วันหรือเวลาเครื่องผิด
  - แก้: ข้ามรายการที่หมดอายุก่อนส่ง และถ้า batch ได้ 400 จะส่งทีละรายการเพื่อตัดเฉพาะตัวที่ผิดออก
  - error จากเน็ตไม่ทำให้ข้อมูลหาย (ทดสอบครบทั้ง 5 กรณี)
- **[กลาง] Modbus อ่านทีละ register** *(ใหม่)*
  - แก้: รวม register ที่อยู่ติดกันเป็น request เดียว (20 → 1)
  - ถ้าอุปกรณ์ไม่รองรับ จะกลับไปอ่านทีละตัวเอง ค่าที่อ่านได้ตรงกับแบบเดิม 100%
  - ปิดได้ด้วย `"block_read": false`

### เวิร์กโฟลว์

- **`npm run verify:local`** — ทดสอบทั้งระบบในคำสั่งเดียว (หัวข้อ 5) *(ใหม่)*
  - สคริปต์นี้แก้ปัญหาที่เจอตอนทดสอบรอบแรกให้ด้วย: ยังไม่ได้ติดตั้ง dependency, ยังไม่มี `.env` และสร้างอุปกรณ์ไม่ได้เพราะ `DEVICE_SECRET_ENCRYPTION_KEY` ว่าง
- CI เพิ่ม job `backend-e2e` บน TimescaleDB จริง: migrate → start → smoke test *(ใหม่)*
- สคริปต์ export เร็วขึ้น 4 เท่า และ zip ใช้งานได้บน Linux/macOS *(ฉบับแรก)*
- Docker DB มี healthcheck *(ฉบับแรก)*
- `check:backend` ตรวจทุกไฟล์ *(ฉบับแรก)*
- `.gitignore` ไม่ซ่อนไฟล์ `.env.example` อีก *(ฉบับแรก)*

---

## 5. การทดสอบและนำขึ้นระบบ

### ทดสอบในเครื่อง (คำสั่งเดียว)

```powershell
cd "D:\IoT Project\dotwatch"
git checkout -b perf-review
git apply --whitespace=nowarn dotwatch-performance-v2-main-85b4e78.patch
npm run verify:local
```

patch นี้ทำจาก GitHub `main` commit `85b4e78` ถ้า `main` มี commit ใหม่กว่านั้น ให้ตรวจด้วย `git apply --check` ก่อน

สคริปต์จะทำตามลำดับ:

1. ตรวจ Node/Docker
2. ติดตั้ง dependency ที่ยังขาด
3. สร้าง `.env` (ถ้ายังไม่มี) และสร้าง key สำหรับ local
4. เปิด DB ใน Docker และรอจนพร้อม
5. migrate
6. build และ typecheck ทุกแอป รวมถึงรันสคริปต์ verify เดิม 25 ตัว
7. เปิด backend ชั่วคราวที่ port 4100 แล้วรัน smoke test 12 ข้อ
8. dry run สคริปต์ index และ retention

สรุปผล PASS/FAIL จะเก็บไว้ที่ `_reports/local-verify-<เวลา>/` และสคริปต์จะไม่ยอมรันถ้า `DATABASE_URL` ไม่ใช่ฐานข้อมูล local

**ผลที่คาดไว้:** ผ่านทุกข้อ ยกเว้น `existing verify scripts (25)` ที่จะขึ้น FAIL จาก `phase11g-admin-dashboard-parity-verify.mjs` ข้อเดียว ("Admin and Dashboard share Prompt-capable font stack") ข้อนี้ fail อยู่แล้วบน `main` ก่อนใส่ patch เพราะงานปรับฟอนต์วันที่ 22–23 ก.ค. ไม่ได้เกิดจาก patch นี้ สคริปต์ verify ที่เพิ่มเข้ามาใน `main` อีก 6 ตัว (`verify-locked-device-models`, `verify-selected-device-*` และ `verify-values-alarms-simplified-header`) ก็ fail อยู่แล้วบน `main` เช่นกัน ซึ่ง `verify:local` ไม่ได้รันกลุ่มนี้

ตัวเลือกเพิ่มเติม: `-SkipInstall`, `-SkipBuild`, `-SkipMobile`

### นำขึ้น production

1. **Backup DB** ด้วย `npm run db:backup`
2. **Deploy backend** — migration ครั้งนี้เพิ่มแค่ index 4 ตัวแบบ concurrent ไม่เปลี่ยน schema
3. **ตั้ง env** — ไม่ตั้งก็ใช้ค่าเริ่มต้นที่ปลอดภัยได้

   | ตัวแปร | ค่าแนะนำ |
   |---|---|
   | `DATABASE_POOL_MAX` | 10 (ต้องน้อยกว่า connection limit ของ DB) |
   | `DATABASE_POOL_CONNECTION_TIMEOUT_MS` | 10000 |
   | `DATABASE_STATEMENT_TIMEOUT_MS` | 30000 |
   | `DEVICE_AUTH_CACHE_TTL_MS` | 600000 |
   | `USER_CONTEXT_CACHE_TTL_MS` | 60000 |
   | `HTTP_LOG_INGEST_SUCCESS` | false |
   | `INGEST_HISTORY_BACKFILL_SECONDS` | 0 (ดูข้อ 6.4) |

4. **ลบ index ซ้ำ** ช่วงที่คนใช้น้อย: `npm run db:dedupe-indexes` → `npm run db:dedupe-indexes:apply`
5. **Retention** (ตัดสินใจเชิงธุรกิจก่อน): `npm run db:retention` เพื่อดูยอดที่จะลบ → `npm run db:retention:apply` ถ้าต้องการให้ทำประจำ ให้ตั้งเป็น Render Cron Job วันละครั้ง
6. **Deploy dashboard** และ build mobile ใหม่
7. **อัปเดต Pi agent** (ไฟล์ `.py` ทั้งหมด) และตั้ง `QUEUE_FLUSH_LIMIT=50`

**Rollback:** ย้อนโค้ดได้ทันที เพราะไม่มีการเปลี่ยน schema ส่วน cache ปิดได้ด้วย env `=0`

**ข้อควรรู้:** cache เป็นแบบต่อ process ถ้ารัน backend หลาย instance การเปลี่ยน role/status ของ user จะมีผลกับ instance อื่นภายใน 60 วินาที

---

## 6. ข้อเสนอแนะที่ยังไม่ได้แก้

| # | เรื่อง | ความสำคัญ |
|---|---|---|
| 6.1 | CSS ของ Dashboard | สูง |
| 6.2 | Firmware เปิด TLS ใหม่ทุกครั้ง | สูง |
| 6.3 | Realtime ไม่ถึงสมาชิกองค์กร / สิทธิ์ไม่สม่ำเสมอ | สูง (ความถูกต้อง) |
| 6.4 | นโยบาย backfill ของ history | กลาง (ตัดสินใจเชิงธุรกิจ) |
| 6.5 | เขียน telemetry ซ้ำ 2 ตาราง | กลาง |
| 6.6 | ลบอุปกรณ์แบบ hard delete | กลาง |
| 6.7 | Admin list ไม่มี pagination | กลาง |
| 6.8 | History หลาย metric = หลาย request | กลาง |
| 6.9 | Mobile เปิด WebSocket หลายเส้น / Dashboard เลิก reconnect | กลาง |
| 6.10 | Timescale retention/compression | กลาง |
| 6.11 | จัดระเบียบไฟล์และเวอร์ชัน dependency | กลาง |
| 6.12 | OTA cache / RSSI redraw / index ที่ไม่ได้ใช้ | ต่ำ |

**6.1 CSS ของ Dashboard**

- ขนาด: 56 ไฟล์, 680 KB และ `!important` 2,759 จุด ส่วน CSS ที่โหลดตั้งแต่หน้าแรกคือ 326 KB (51 KB gzip)
- selector ราว 49% เป็นการเขียนทับของเดิม เช่น `.stat-card` ถูกนิยามซ้ำ 34 ครั้ง
- แนะนำ: หยุดเพิ่มไฟล์ `*-fix` / `*-unify` / `phase*` แล้วรวมกลับเข้าไฟล์หลักทีละหน้า และวัดผลด้วย `npm run audit:dashboard-style`

**6.2 Firmware**

- `BackendClient` สร้าง `WiFiClientSecure` ใหม่ทุกครั้ง (ESP8266 ตั้ง `setReuse(false)` ไว้ด้วย) จึง handshake TLS ทุก 10–20 วินาที และบล็อก loop ประมาณ 1–2 วินาทีต่อครั้ง
- แนะนำ: ใช้ client ตัวเดิม + `setReuse(true)` หรือย้าย HTTP ไปทำใน FreeRTOS task และลดการพิมพ์ payload ออก Serial
- ต้องทดสอบบนบอร์ดจริงก่อน

**6.3 Realtime / สิทธิ์ขององค์กร**

- Backend broadcast ไปหาเจ้าของอุปกรณ์เท่านั้น สมาชิกองค์กรจึงเห็นอุปกรณ์ในรายการแต่ค่าไม่อัปเดตแบบ realtime
- หน้า value settings (`/devices/:id/metrics`) ตรวจสิทธิ์แบบเจ้าของเท่านั้น แต่ history ใช้สิทธิ์ขององค์กร
- เรื่องนี้เป็นการตัดสินใจด้านสิทธิ์ จึงไม่ได้แก้เอง

**6.4 Backfill**

- Backend เก็บ history เฉพาะข้อมูลอายุไม่เกิน 60 วินาที ข้อมูลที่ Pi เก็บไว้ตอนออฟไลน์จึงไม่เข้า history
- ตั้ง `INGEST_HISTORY_BACKFILL_SECONDS=86400` ถ้าต้องการเก็บ (ทดสอบแล้วว่าเก็บครบ)

**6.5 เขียนซ้ำ 2 ตาราง**

- ESP32 ส่งทั้ง `temperature/humidity` และ `metrics` ทำให้เขียนทั้ง `sensor_readings` และ `device_metric_readings`
- แนะนำ: ให้ `listDevices` อ่านจาก `device_metric_latest` แล้วค่อยเลิกเขียน `sensor_readings`

**6.6 Hard delete**

- `DELETE FROM devices` cascade ลบ telemetry ทั้งหมดใน request เดียว อุปกรณ์ที่มีข้อมูลหลายล้านแถวอาจเกิน timeout 20 วินาทีของหน้าเว็บ
- แนะนำ: ทำ soft delete แล้วลบข้อมูลใน background

**6.7 Admin**

- รายการ user และอุปกรณ์ของ Admin โหลดทั้งหมดในครั้งเดียว ควรทำ pagination

**6.8 History**

- โหมด "ทุก metric" ยิง 1 request ต่อ metric ควรมี endpoint ที่รับหลาย metric ใน request เดียว

**6.9 Realtime connection**

- Mobile แต่ละหน้าเปิด WebSocket ของตัวเอง ควรใช้ connection เดียวร่วมกัน
- Dashboard หยุด reconnect หลัง 8 ครั้ง ควรรีเซ็ตเมื่อแท็บกลับมา active

**6.10 Timescale**

- policy compression/retention อยู่ในไฟล์ 013 ซึ่ง `run.js` ไม่ได้รัน
- ตรวจด้วย `npm run db:health` ว่ามี job ทำงานจริงใน production

**6.11 จัดระเบียบ**

- root มีไฟล์ `.md/.txt` 32 ไฟล์, `docs/` 83 ไฟล์, `scripts/` 87 ไฟล์ และ firmware `.bin` 3.7 MB อยู่ใน repo
- Dashboard ใช้ React 18 + Vite 5 แต่ Admin ใช้ React 19 + Vite 8
- แนะนำ: ย้ายเอกสารที่จบแล้วไป `docs/archive/`, ใช้ npm workspaces และเก็บ firmware ใน Releases

**6.12 ต่ำ**

- OTA server ควร cache manifest ตาม mtime ของไฟล์
- ESP32 วาดแถบ WiFi ใหม่ทุกครั้งที่ RSSI ขยับ 1 dBm ควรเทียบที่จำนวนขีด
- ดู `pg_stat_user_indexes` หลังใช้งานจริง 1–2 สัปดาห์ แล้วลบ index `(metric_key, time)` ถ้าไม่ถูกใช้

---

## 7. ไฟล์ที่เปลี่ยน

**Backend**

- แก้ไข: `src/db/pool.js`, `src/config/env.js`, `src/server.js`, `src/utils/logger.js`
- แก้ไข middleware: `authDevice.js`, `authUser.js`, `loadUser.js`, `errorHandler.js`
- แก้ไข services: `user.service.js`, `alarm.service.js`, `organizationAccess.service.js`, `weatherVirtualDevice.service.js`, `adminDatabaseUsage.service.js`
- แก้ไข controllers: `ingest.controller.js`, `devices.controller.js`, `deviceMetricsController.js`, `admin.controller.js`
- แก้ไขอื่น: `migrations/run.js`, `package.json`, `package-lock.json`, `.env.example`, `.env.production.example`
- ใหม่: `scripts/db-dedupe-indexes.mjs`, `scripts/db-retention.mjs`, `scripts/local-smoke-test.mjs`, `scripts/check-syntax.mjs`

**Dashboard:** `vite.config.js`, `src/main.jsx`, `src/services/realtime.js`, `src/context/AlarmContext.jsx`, `src/pages/Dashboard.jsx`, `src/pages/History.jsx`, `src/pages/CompareGraph.jsx`, `src/components/LatestActiveAlarms.jsx`

**Mobile:** `app/(app)/index.tsx`, `app/(app)/devices/[id].tsx`, `src/utils/device.ts`, `src/api/history.ts`, `src/api/client.ts`, `src/providers/AppProviders.tsx`

**Pi agent:** `main.py`, `config.py`, `runtime/offline_queue.py`, `services/dotwatch_api.py`, `sensors/modbus_sensor.py`, `modbus_config.example.json`, `pi_config_web.py`, `install_config_ui_service.sh`, `.env.example`, `README_PI_PRODUCTION.md`

**Repo**

- แก้ไข: `package.json`, `docker-compose.yml`, `.gitignore`, `scripts/export-clean.ps1`
- ใหม่: `scripts/local-verify.ps1`, `.github/workflows/ci.yml`, `docs/PERFORMANCE_REVIEW_TH.md`
