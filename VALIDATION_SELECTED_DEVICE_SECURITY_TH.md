# Validation Report — Selected Device Security

วันที่ตรวจสอบ: 22 กรกฎาคม 2026

## ฐานไฟล์

- ฐานงาน: `dotwatch-device-model-fixed-icons-full-20260721.zip`
- งานใหม่สะสมการปรับ Device Model และ Icon จากรอบก่อนครบถ้วน

## ผลตรวจสอบ

| รายการ | ผล |
|---|---|
| นำ Device ID ออกจาก Security UI | ผ่าน |
| นำ Secret Status ออกจาก Security UI | ผ่าน |
| Device Code ไม่มีกรอบ | ผ่าน |
| คลิก Secret ที่ซ่อนแล้วเปิด Password modal | ผ่าน |
| Password ตรวจผ่าน Firebase re-authentication | ผ่าน |
| ดู Secret บังคับ Refresh Firebase ID token | ผ่าน |
| Reset Secret ต้องกรอก Password ก่อน | ผ่าน |
| Reset Secret ต้องยืนยัน `Reset Secret` อีกครั้ง | ผ่าน |
| Backend ป้องกัน Get Secret ด้วย recent authentication | ผ่าน |
| Backend ป้องกัน Reset Secret ด้วย recent authentication | ผ่าน |
| Token ใหม่อายุ 30 วินาทีผ่าน middleware | ผ่าน |
| Token เก่าอายุ 10 นาทีถูกปฏิเสธด้วย 403 | ผ่าน |
| Token ไม่มี `auth_time` ถูกปฏิเสธด้วย 403 | ผ่าน |
| Dashboard production build | ผ่าน |
| Backend syntax check | ผ่าน |
| Static verification script | ผ่าน |
| Apply Patch ทับฐานล่าสุดและเปรียบเทียบไฟล์ | ผ่าน |
| Dashboard build หลัง Apply Patch | ผ่าน |
| ตรวจว่าไม่ต้องใช้ migration | ผ่าน |

## คำสั่งที่ใช้ตรวจ

```bash
npm --prefix apps/dashboard run build:production
npm --prefix services/backend run check:syntax
node services/backend/src/middlewares/requireRecentAuthentication.js
node scripts/verify-selected-device-security.mjs
```

มีการทดสอบ middleware เพิ่มโดยจำลอง Request 3 รูปแบบ:

- Fresh authentication: เรียก `next()`
- Stale authentication: ตอบ `403 RECENT_AUTH_REQUIRED`
- Missing `auth_time`: ตอบ `403 RECENT_AUTH_REQUIRED`

## ข้อสังเกต

Dashboard ไม่มี `eslint.config.js` หรือ `.eslintrc` ในฐานไฟล์เดิม ทำให้คำสั่ง `npm run lint` ของ Dashboard ไม่สามารถใช้เป็นตัวตรวจเฉพาะไฟล์ได้ในสภาพปัจจุบัน อย่างไรก็ตาม Vite production build ผ่านครบ ซึ่งยืนยันการ parse และ bundle ของ JSX/CSS/JavaScript ที่แก้ไขแล้ว

## Database

ไม่มีการแก้ schema หรือข้อมูลในฐานข้อมูล จึงไม่ต้องรัน migration หลัง Deploy

## ขอบเขตที่ไม่ได้เปลี่ยน

- Admin UI
- Device Model policy
- Firmware
- OTA Server
- Mobile App
- การสร้าง Device Secret และการเข้ารหัสเดิมใน Backend
