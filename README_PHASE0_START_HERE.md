# dotWatch Phase 0 - Start Here

ไฟล์ชุดนี้เป็นการปรับฐานโปรเจกต์ให้สะอาด ปลอดภัย และพร้อมพัฒนาต่อ โดยยังไม่เปลี่ยน UX/UI หรือ logic หลักของ Dashboard/Pi Agent

## สิ่งที่แก้ในชุดนี้

1. เพิ่ม `.gitignore` และ `.dockerignore` ให้กันไฟล์ที่ไม่ควร commit/export
2. ล้างไฟล์ `.env.example` ให้ไม่มี secret จริง
3. เพิ่ม `.env.production.example` สำหรับ Backend, Dashboard และ Admin
4. เพิ่ม production guard ใน Backend เพื่อกัน `DEV_AUTH_BYPASS=true` หลุดขึ้น production
5. เพิ่ม scripts ช่วยงาน Phase 0:
   - `scripts/prepare-local-env.ps1`
   - `scripts/scan-sensitive-files.ps1`
   - `scripts/doctor.ps1`
   - `scripts/export-clean.ps1`
   - `scripts/check-production-env.mjs`
6. เพิ่มเอกสาร roadmap และ checklist สำหรับเฟสต่อไป

## วิธีวางไฟล์

แตก zip แล้ว copy โฟลเดอร์/ไฟล์ทั้งหมดไปวางทับในโฟลเดอร์ `dotwatch` เดิม

ตัวอย่าง:

```powershell
D:\IoT Project\dotwatch\
```

หลังวางทับแล้ว เปิด PowerShell ที่โฟลเดอร์ `dotwatch`

## ขั้นตอนแรกหลังวางไฟล์

### 1. สแกนว่าในโปรเจกต์ยังมีไฟล์ลับไหม

```powershell
npm run scan:secrets
```

ถ้าขึ้นว่าเจอ `.env` จริง ไม่ต้องตกใจ เพราะไฟล์ `.env` ใช้รัน local ได้ แต่ห้าม commit หรือ export ให้คนอื่น

### 2. สร้างไฟล์ env สำหรับ local ถ้ายังไม่มี

```powershell
npm run env:local
```

คำสั่งนี้จะ copy:

- `services/backend/.env.example` → `services/backend/.env`
- `apps/dashboard/.env.example` → `apps/dashboard/.env.local`
- `apps/admin/.env.example` → `apps/admin/.env.local`

ถ้ามีไฟล์อยู่แล้วจะไม่ทับ ยกเว้นใช้:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/prepare-local-env.ps1 -Overwrite
```

### 3. เช็ก project health

```powershell
npm run doctor
```

ถ้าต้องการเช็ก build ด้วย:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/doctor.ps1 -RunBuild
```

### 4. สร้าง zip สะอาดสำหรับส่งต่อหรือสำรอง

```powershell
npm run export:clean
```

ไฟล์จะถูกสร้างใน:

```text
_export/dotwatch-clean-YYYYMMDD-HHMMSS.zip
```

zip นี้จะไม่รวม:

- `.git`
- `node_modules`
- `dist` / `build`
- `.env` จริง
- logs/cache/backup/compressed files

## คำสั่ง local run ที่แนะนำ

```powershell
docker compose up -d db
npm run install:all
npm run backend:migrate
npm run backend:dev
```

เปิดอีก terminal:

```powershell
npm run dashboard:dev
```

เปิด admin:

```powershell
npm run admin:dev
```

## ข้อควรทำทันที

เนื่องจากไฟล์ก่อนหน้าเคยมี private key อยู่ในไฟล์ตัวอย่าง แนะนำให้ไป Firebase Console แล้ว rotate/revoke service account key ตัวเดิม จากนั้นสร้าง key ใหม่ และนำไปใส่เฉพาะใน Render Environment Variables เท่านั้น
