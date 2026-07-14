# dotWatch Mobile Foundation

Mobile MVP foundation สำหรับ dotWatch โดยใช้ React Native, Expo Router,
TypeScript, Firebase Authentication, Render REST API, TanStack Query
และ WebSocket realtime เดิมของ Backend

## ขอบเขตไฟล์ชุดนี้

- Login ด้วย Firebase Email/Password
- Session ผ่าน Firebase Auth
- Dashboard summary
- Device list
- Device detail
- Temperature และ Humidity
- WebSocket subscribe ด้วย Firebase ID Token
- Pull to refresh
- Settings และ Logout
- Root npm scripts สำหรับ mobile

ยังไม่รวม Alarm UI, History chart และ Push Notification ซึ่งควรทำใน phase ถัดไป

## ติดตั้งบน Windows PowerShell

จาก root ของ repository:

```powershell
Copy-Item `
  -LiteralPath ".\apps\mobile\.env.example" `
  -Destination ".\apps\mobile\.env"
```

แก้ไข `apps/mobile/.env` แล้วใส่ Firebase Web App configuration
ชุดเดียวกับ Dashboard

ติดตั้ง dependency:

```powershell
npm --prefix apps/mobile install
```

ตรวจ TypeScript:

```powershell
npm run check:mobile
```

เปิด Expo:

```powershell
npm run mobile:start
```

จากนั้น:

- กด `a` เพื่อเปิด Android Emulator
- หรือสแกน QR ด้วย Expo Go เมื่อคอมพิวเตอร์และมือถืออยู่เครือข่ายเดียวกัน

## Environment

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

ห้ามใส่ Firebase Admin private key, Render API key, Database URL
หรือ Device Secret ลงใน Mobile App

## API ที่ใช้

```text
GET /api/devices
GET /api/devices/:id
```

ทุก request ส่ง:

```http
Authorization: Bearer <firebase-id-token>
```

WebSocket ส่งหลังเชื่อมต่อ:

```json
{
  "type": "subscribe",
  "token": "<firebase-id-token>"
}
```

## หมายเหตุเรื่อง Firebase persistence

Firebase JS SDK บน React Native จะรักษาสถานะผู้ใช้ตามความสามารถของ runtime
แต่ก่อน production release ควรเพิ่ม React Native AsyncStorage persistence
และทดสอบ cold start บน Android release build โดยตรง

## Phase ต่อไป

1. Alarm list และ acknowledge
2. History API และ chart
3. Foreground/background AppState lifecycle สำหรับ WebSocket
4. Expo Notifications/FCM push token
5. EAS Android internal build
6. Sentry และ production error handling
