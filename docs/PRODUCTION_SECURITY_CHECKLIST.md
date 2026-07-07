# Production Security Checklist

ใช้ checklist นี้ก่อน deploy Backend/Dashboard/Admin ขึ้น production ทุกครั้ง

## Backend Environment

- [ ] `NODE_ENV=production`
- [ ] ไม่มี `DEV_AUTH_BYPASS=true`
- [ ] `DATABASE_URL` เป็น production database ไม่ใช่ localhost
- [ ] `CORS_ORIGIN` เป็น URL จริงเท่านั้น เช่น `https://dotwatch.onrender.com`
- [ ] `CORS_ORIGIN` ไม่มี `*`
- [ ] `CORS_ORIGIN` ไม่มี `localhost`, `127.0.0.1`, `0.0.0.0`
- [ ] `FIREBASE_PROJECT_ID` ถูกต้อง
- [ ] `FIREBASE_CLIENT_EMAIL` ถูกต้อง
- [ ] `FIREBASE_PRIVATE_KEY` ใส่ใน Render Environment Variables เท่านั้น
- [ ] `DEVICE_SECRET_ENCRYPTION_KEY` เป็น key ใหม่ที่ generate เอง

## Firebase Admin

- [ ] ลบ/revoke key เก่าที่เคยอยู่ในไฟล์หรือเคยส่งต่อ
- [ ] สร้าง service account key ใหม่
- [ ] เก็บ key ใหม่เฉพาะใน Render Environment Variables
- [ ] ไม่ใส่ private key ใน `.env.example`, README, screenshot หรือ chat

## Repository

- [ ] `npm run scan:secrets` ผ่าน
- [ ] `.gitignore` กัน `.env` แล้ว
- [ ] ไม่มี `node_modules` ใน git
- [ ] ไม่มี `dist/build` ใน git ยกเว้นตั้งใจ deploy static build จาก branch แยก
- [ ] ไม่มี `.zip` backup อยู่ใน repo

## Render

- [ ] Build Command ถูกต้อง
- [ ] Start Command ถูกต้อง
- [ ] Pre-Deploy Command มี `npm run migrate` หากต้องการ auto migrate
- [ ] Health check ผ่าน `/health`
- [ ] Logs ไม่มี secret หลุด

## Raspberry Pi

- [ ] `.env` บน Pi มี DEVICE_CODE/DEVICE_SECRET จริงเฉพาะเครื่องนั้น
- [ ] Config UI password ถูกเปลี่ยนแล้ว
- [ ] Agent service restart อัตโนมัติ
- [ ] Logs ไม่พิมพ์ device secret
