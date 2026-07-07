# Phase 0 Stabilization

เป้าหมายของ Phase 0 คือทำให้ dotWatch อยู่ในสภาพที่พัฒนาต่อได้ปลอดภัย รันซ้ำได้ และส่งไฟล์ต่อได้โดยไม่ปน secret หรือไฟล์หนัก

## Priority 1: Repository hygiene

สถานะที่ต้องการ:

- ไม่มี `node_modules` ใน zip/source control
- ไม่มี `.git` ในไฟล์ส่งต่อ
- ไม่มี `dist`, cache, logs, backup ในไฟล์ส่งต่อ
- ไม่มี `.env` จริงใน zip/source control
- มีเฉพาะ `.env.example` และ `.env.production.example`

ไฟล์ที่เพิ่ม:

- `.gitignore`
- `.dockerignore`
- `apps/dashboard/.dockerignore`
- `apps/admin/.dockerignore`
- `services/backend/.dockerignore`
- `scripts/export-clean.ps1`
- `scripts/scan-sensitive-files.ps1`

คำสั่งหลัก:

```powershell
npm run scan:secrets
npm run export:clean
```

## Priority 2: Environment safety

สถานะที่ต้องการ:

- Local ใช้ `DEV_AUTH_BYPASS=true` ได้
- Production ห้ามใช้ `DEV_AUTH_BYPASS=true`
- Production ต้องใช้ `NODE_ENV=production`
- Production ต้องระบุ Firebase Admin, CORS, Database, Encryption Key ครบ
- CORS production ห้ามเป็น localhost หรือ wildcard

ไฟล์ที่แก้:

- `services/backend/src/config/env.js`
- `services/backend/.env.example`
- `services/backend/.env.production.example`
- `scripts/check-production-env.mjs`

คำสั่งตรวจ env production จากไฟล์ตัวอย่างที่สร้างเอง:

```powershell
node scripts/check-production-env.mjs --file services/backend/.env.production.local
```

หรือถ้ารันบนเครื่องที่ set env แล้ว:

```powershell
npm run env:prod:check
```

## Priority 3: Local bootstrap

สถานะที่ต้องการ:

- Clone/แตก zip แล้วเริ่ม local ได้ด้วยขั้นตอนเดิมทุกครั้ง
- ไม่ต้องเดาว่าต้องสร้าง env ไฟล์ไหนบ้าง

ไฟล์ที่เพิ่ม:

- `scripts/prepare-local-env.ps1`
- `scripts/doctor.ps1`
- `README_PHASE0_START_HERE.md`

คำสั่งหลัก:

```powershell
npm run env:local
npm run doctor
```

## Done definition

Phase 0 ถือว่าเสร็จเมื่อ:

- `npm run scan:secrets` ไม่เจอ secret ที่ไม่ควรอยู่ใน repo
- `npm run export:clean` สร้าง zip ขนาดเล็กได้สำเร็จ
- Backend local start ได้
- Dashboard local start ได้
- Render production ไม่มี `DEV_AUTH_BYPASS=true`
- Firebase Admin key เก่าที่เคยหลุดในไฟล์ตัวอย่างถูก revoke แล้ว
