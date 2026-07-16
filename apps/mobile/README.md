# dotWatch Mobile

Mobile application สำหรับ dotWatch โดยใช้ React Native, Expo Router,
TypeScript, Firebase Authentication, Render REST API, WebSocket realtime,
Expo Notifications และ EAS Build

## สถานะปัจจุบัน

ฟังก์ชันที่รวมแล้ว:

- Firebase Email/Password login และ session persistence
- Dashboard summary
- Device list และ Device detail
- Temperature และ Humidity
- WebSocket realtime พร้อม foreground/background lifecycle
- Alarm list, history และ acknowledge
- History API และกราฟช่วงเวลา
- Notification feed และ deep link
- Expo Push Token registration
- Backend health banner
- React error boundary
- EAS development, preview และ production profiles

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

ค่าที่ขึ้นต้นด้วย `EXPO_PUBLIC_` จะถูกฝังใน client bundle และต้องถือว่าเป็น
public configuration ห้ามใส่ Firebase Admin private key, Database URL,
Render API key หรือ Device Secret

สำหรับ local development ใช้ `apps/mobile/.env`

สำหรับ EAS Cloud Build ให้สร้างตัวแปรชุดเดียวกันใน EAS Environment:
`development`, `preview` และ `production`

## ตรวจโครงการ

```powershell
npm --prefix apps/mobile install
npm run check:mobile
npm --prefix apps/mobile run check:release
npm run scan:secrets
```

## EAS account และ project

```powershell
Set-Location "D:\IoT Project\dotwatch\apps\mobile"
npx eas-cli whoami
npx eas-cli project:info
```

Project ต้องตรงกับ:

```text
owner: panupongsonjai
slug: dotwatch-mobile
projectId: 4a67ad2a-98a6-47a7-85ae-316bcd864365
```

## Android internal APK

```powershell
npx eas-cli env:list --environment preview
npx eas-cli build --platform android --profile preview
```

Preview profile สร้าง APK ที่ติดตั้งบน Android ได้โดยตรงและไม่ต้องเปิด Metro

## Android production bundle

หลัง internal APK ผ่าน smoke test แล้ว:

```powershell
npx eas-cli build --platform android --profile production
```

ดูรายละเอียดใน `PHASE_M8_ANDROID_INTERNAL_BUILD.md`
