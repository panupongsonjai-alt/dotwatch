# dotWatch Production Readiness Checklist

ใช้ก่อน deploy production ทุกครั้ง

## Backend

- [ ] `NODE_ENV=production`
- [ ] ไม่มี `DEV_AUTH_BYPASS=true`
- [ ] `DATABASE_URL` เป็น production database ไม่ใช่ localhost
- [ ] `CORS_ORIGIN` เป็น dashboard/admin domain จริงเท่านั้น
- [ ] `CORS_ORIGIN` ไม่มี wildcard `*`
- [ ] Firebase Admin variables ถูกตั้งครบ:
  - [ ] `FIREBASE_PROJECT_ID`
  - [ ] `FIREBASE_CLIENT_EMAIL`
  - [ ] `FIREBASE_PRIVATE_KEY`
- [ ] `DEVICE_SECRET_ENCRYPTION_KEY` เป็น key ใหม่ ไม่ใช่ placeholder
- [ ] `/health` returns database connected
- [ ] `/debug/*` endpoints return 404 in production
- [ ] WebSocket subscribe ใช้ Firebase token จริง
- [ ] Logs ไม่แสดง Firebase private key, device secret, database password

ตรวจ env production ได้ด้วย:

```powershell
node scripts/check-production-env.mjs --file services/backend/.env.production.local
```

หรือถ้าตั้ง env ใน shell แล้ว:

```powershell
npm run env:prod:check
```

## Dashboard

- [ ] ใช้ `.env.production.example` เป็นต้นแบบเท่านั้น
- [ ] `VITE_API_URL` เป็น backend URL จริงแบบ HTTPS
- [ ] `VITE_WS_URL` เป็น backend URL จริงแบบ WSS
- [ ] Firebase Web SDK config ถูกต้อง
- [ ] `npm run dashboard:build` ผ่าน
- [ ] Login/Register ใช้งานได้
- [ ] Dashboard, Devices, Device Detail, History, Alarms, Notifications, System Health, Profile, Settings เปิดได้

## Admin

- [ ] `VITE_USE_MOCK_ADMIN_API=false` ใน production
- [ ] `VITE_API_URL` เป็น backend URL จริงแบบ HTTPS
- [ ] Firebase Web SDK config ถูกต้อง
- [ ] `npm run admin:build` ผ่าน

## Database

- [ ] Migrations ถูก run แล้ว
- [ ] Device ownership maps to correct `users.id` and `firebase_uid`
- [ ] Raspberry Pi device belongs to the real dashboard user
- [ ] Retention/compression jobs are active if using TimescaleDB
- [ ] Backup/restore strategy มีแล้ว

## Realtime

- [ ] Open System Health and confirm WebSocket connected
- [ ] Send one ingest payload from Raspberry Pi
- [ ] Confirm Dashboard and Device Detail values update without refresh
- [ ] Confirm backend logs show broadcast for new reading

## Raspberry Pi

- [ ] Agent `.env` มี `DEVICE_CODE` และ `DEVICE_SECRET` จริงเฉพาะเครื่องนั้น
- [ ] Config UI password ถูกเปลี่ยนจากค่า default แล้ว
- [ ] systemd service enabled and running
- [ ] Agent restart ได้หลัง reboot
- [ ] Logs ไม่พิมพ์ device secret

## Repository/export

- [ ] `npm run scan:secrets` ผ่านก่อน commit/export
- [ ] `npm run export:clean` ใช้สำหรับ zip ส่งต่อ
- [ ] zip ที่ส่งต่อไม่มี `.git`, `node_modules`, `dist`, `.env` จริง
