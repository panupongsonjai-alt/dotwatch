# dotWatch Mobile

Mobile monitoring app สำหรับ dotWatch ใช้ React Native, Expo Router,
TypeScript, Firebase Authentication, Render REST API, TanStack Query,
WebSocket realtime และ Expo Push Notifications

## ฟังก์ชันที่มีแล้ว

- Login ด้วย Firebase Email/Password
- Firebase session persistence ผ่าน AsyncStorage บน Android/iOS
- Dashboard summary และรายการ Device ล่าสุด
- Device list และ Device detail
- Dynamic Values ตามการตั้งค่าจริงของแต่ละ Device
- Latest Value cards พร้อมชื่อ หน่วย และ decimal places
- History chart แบบเลือก Value ได้ รองรับ 1h, 6h, 24h และ 7d
- WebSocket realtime และ reconnect เมื่อกลับเข้า Foreground
- Active Alarm, Alarm History และ Acknowledge
- Expo Push Token register/unregister
- Notification deep link ไปยัง Device Detail
- Safe logout ที่ยกเลิก Push Token ของอุปกรณ์ก่อน Sign out
- Environment validation ก่อนเปิด Firebase และ API

## Environment

คัดลอกไฟล์ตัวอย่างสำหรับการพัฒนาในเครื่อง:

```powershell
Copy-Item `
  -LiteralPath ".\apps\mobile\.env.example" `
  -Destination ".\apps\mobile\.env"
```

กำหนดค่าให้ครบ:

```env
EXPO_PUBLIC_API_URL=https://dotwatch-backend.onrender.com
EXPO_PUBLIC_WS_URL=wss://dotwatch-backend.onrender.com

EXPO_PUBLIC_FIREBASE_API_KEY=
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=
EXPO_PUBLIC_FIREBASE_PROJECT_ID=
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
EXPO_PUBLIC_FIREBASE_APP_ID=
```

ห้ามใส่ Firebase Admin private key, Render API key, Database URL,
Device Secret หรือ OTA private key ลงใน Mobile App

สำหรับ EAS Build ให้กำหนด `EXPO_PUBLIC_*` ชุดเดียวกันใน EAS Build Environment
ไม่จำเป็นต้อง commit ไฟล์ `.env`

## ติดตั้งและตรวจสอบ

```powershell
Set-Location "D:\IoT Project\dotwatch"

npm --prefix apps/mobile install
npm --prefix apps/mobile run typecheck
npm --prefix apps/mobile run check:release
```

`check:release` ตรวจ Environment จริงจาก `.env` หรือ Environment Variables
และจะ FAIL เมื่อค่าที่จำเป็นไม่ครบ

## เปิด Development App

```powershell
npm run mobile:start
```

Remote Push Notification ต้องทดสอบบน Development Build หรือ Preview APK
บนอุปกรณ์จริง ไม่ใช่ Expo Go

## Build ด้วย EAS

ไม่ติดตั้ง `eas-cli` ไว้ใน project dependency ให้เรียกผ่าน `npx`:

```powershell
Set-Location "D:\IoT Project\dotwatch\apps\mobile"

npx eas build --platform android --profile development
npx eas build --platform android --profile preview
npx eas build --platform android --profile production
```

## Backend migration สำหรับ Push Notification

ตาราง `mobile_push_tokens` รวมอยู่ใน migration หลักแล้ว:

```powershell
npm --prefix services/backend run migrate
```

หรือรันเฉพาะ migration ของ Mobile Push:

```powershell
npm --prefix services/backend run mobile-push:migrate
```

Migration จะสร้างตารางและ index แบบ idempotent พร้อมป้องกัน Expo Push Token
หนึ่งรายการถูกใช้งานโดยหลายบัญชีพร้อมกัน

## API ที่ Mobile ใช้

```text
GET  /api/devices
GET  /api/devices/:id
GET  /api/devices/:id/metrics
GET  /api/devices/:id/history
GET  /api/alarm-states
GET  /api/alarm-states/history
POST /api/alarms/events/:id/acknowledge
GET  /api/mobile-push/status
POST /api/mobile-push/register
POST /api/mobile-push/unregister
```

ทุก REST request ส่ง Firebase ID Token:

```http
Authorization: Bearer <firebase-id-token>
```

## สิ่งที่ยังต้องยืนยันบนอุปกรณ์จริง

- Cold start แล้วยัง Login อยู่
- Foreground/background/killed-state Push Notification
- แตะ Notification แล้วเปิด Device ที่ถูกต้อง
- Logout แล้วบัญชีเดิมไม่รับ Push อีก
- Preview APK และ Production AAB ติดตั้งและ Login ด้วย Firebase จริง
