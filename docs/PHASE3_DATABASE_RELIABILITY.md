# dotWatch Phase 3 — Database Reliability

Phase นี้เน้นทำให้ฐานข้อมูลปลอดภัยและตรวจสอบได้ก่อน deploy หรือ migrate จริง โดยยังไม่เพิ่ม feature ใหม่ใน dashboard/firmware

## สิ่งที่เพิ่มในชุดนี้

1. `services/backend/migrations/run.js`
   - เพิ่ม PostgreSQL advisory lock เพื่อกัน migration ซ้อนจาก deploy หลายตัวพร้อมกัน
   - เพิ่ม database target safety check ก่อน migrate
   - ซ่อม `device_metric_latest` จาก VIEW/MATERIALIZED VIEW ให้กลับเป็น TABLE อัตโนมัติ
   - backfill `device_metric_latest` จากทั้ง `device_metric_readings` และ legacy `sensor_readings`
   - รองรับ `DATABASE_SSL_REJECT_UNAUTHORIZED` และ `DATABASE_SSL_DISABLED`

2. `services/backend/scripts/db-preflight.mjs`
   - ตรวจ connection, database name, TimescaleDB, table/column/index สำคัญ
   - ตรวจว่า `device_metric_latest` เป็น TABLE จริง
   - ตรวจ device ที่ไม่มี `secret_hash` และ orphan readings

3. `services/backend/scripts/db-health-check.mjs`
   - รายงานจำนวน row, latest ingest, latest metric coverage, hypertables, continuous aggregates, Timescale jobs

4. `scripts/db-backup.ps1`
   - backup ฐานข้อมูลด้วย `pg_dump`
   - default เป็น custom dump
   - รองรับ `-SchemaOnly` และ `-PlainSql`

5. `scripts/db-restore.ps1`
   - restore แบบ dry-run โดย default
   - ต้องใส่ `-Apply` เท่านั้นถึงจะ restore จริง

6. `scripts/phase3-db-verify.ps1`
   - ตรวจว่าไฟล์และ script Phase 3 พร้อมใช้งาน

## คำสั่งใช้งานหลังติดตั้ง patch

### 1. ตรวจไฟล์ Phase 3

```powershell
cd "D:\IoT Project\dotwatch"
npm run verify:phase3:db
```

### 2. ตั้งค่า DATABASE_URL

ใช้ Render **External Database URL** เท่านั้น และอย่า commit ลง git

```powershell
$env:DATABASE_URL="postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require"
```

### 3. Backup ก่อน migrate

```powershell
npm run db:backup
```

ไฟล์จะอยู่ใน:

```text
_backups/database/
```

โฟลเดอร์นี้ถูก ignore และไม่ถูก export-clean แล้ว

### 4. Preflight ก่อน migrate

```powershell
npm run db:preflight
```

ถ้า database ยังไม่เคย migrate และ script แจ้ง table หาย ให้รัน migrate ได้ แต่ถ้าเป็น production ที่มีข้อมูลแล้วควร backup ก่อนเสมอ

### 5. Run migration

```powershell
npm run backend:migrate
```

### 6. ตรวจซ้ำหลัง migrate

```powershell
npm run db:preflight
npm run db:health
```

### 7. ซ่อม latest metric เฉพาะจุด

```powershell
cd "D:\IoT Project\dotwatch\services\backend"
node .\repair-device-metric-latest-table.cjs
node .\check-device-metric-latest.cjs
```

หรือจาก root:

```powershell
npm run db:repair-latest
```

## Restore safety

ดูคำสั่ง restore โดยยังไม่ทำจริง:

```powershell
npm run db:restore -- -BackupFile "D:\IoT Project\dotwatch\_backups\database\dotwatch-full-YYYYMMDD-HHMMSS.dump"
```

restore จริงต้องใส่ `-Apply`:

```powershell
npm run db:restore -- -BackupFile "D:\IoT Project\dotwatch\_backups\database\dotwatch-full-YYYYMMDD-HHMMSS.dump" -Apply
```

ถ้าต้องการล้าง object เดิมก่อน restore:

```powershell
npm run db:restore -- -BackupFile "D:\IoT Project\dotwatch\_backups\database\dotwatch-full-YYYYMMDD-HHMMSS.dump" -Clean -Apply
```

## หมายเหตุสำคัญ

- ห้าม restore production โดยไม่ได้ backup ล่าสุดก่อน
- ห้ามใช้ `DOTWATCH_ALLOW_NON_DOTWATCH_DB=1` ยกเว้นแน่ใจว่าฐานข้อมูลนั้นเป็นของ dotWatch จริง
- `DATABASE_SSL_REJECT_UNAUTHORIZED=false` ยังจำเป็นกับบาง Render Postgres connection string แต่ถ้ามี CA chain ครบสามารถตั้งเป็น `true` ได้ในอนาคต
- Phase นี้ยังไม่ได้เปลี่ยน schema เชิงธุรกิจใหม่ เน้น reliability/safety รอบฐานข้อมูล
