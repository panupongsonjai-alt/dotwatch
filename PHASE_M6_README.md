# dotWatch Mobile Phase M6 — Production Readiness

ติดตั้งต่อจาก Phase M5/M5B

## เพิ่มใน Phase นี้

- Firebase Authentication persistence ด้วย AsyncStorage
- รักษา Login session หลังปิดและเปิดแอป
- ปิด WebSocket เมื่อแอปเข้า background
- เชื่อม WebSocket ใหม่เมื่อกลับ foreground
- รองรับ callback refresh ข้อมูลเมื่อกลับ foreground
- เก็บ Expo Push Token ในอุปกรณ์
- ปุ่ม Disable Push บนอุปกรณ์ปัจจุบัน
- `eas.json` สำหรับ development, preview และ production
- ติดตั้ง `expo-dev-client`

## ติดตั้ง

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File ".\scripts\install-mobile-phase-m6.ps1" `
  -RepoRoot "D:\IoT Project\dotwatch"
```

## ตั้ง EAS Project

```powershell
Set-Location "D:\IoT Project\dotwatch\apps\mobile"

eas login
eas init
eas build:configure
```

ตรวจ `app.json` ให้มี:

```json
{
  "expo": {
    "extra": {
      "eas": {
        "projectId": "YOUR-EAS-PROJECT-ID"
      }
    }
  }
}
```

## Development APK

```powershell
eas build --platform android --profile development
```

## Preview APK

```powershell
eas build --platform android --profile preview
```

## Production AAB

```powershell
eas build --platform android --profile production
```

## ตรวจสอบ

```powershell
npm --prefix apps/mobile run typecheck
node --check services/backend/src/services/alarm.service.js
node --check services/backend/src/services/mobilePush.service.js
```
