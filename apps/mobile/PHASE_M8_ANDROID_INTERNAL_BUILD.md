# dotWatch Mobile Phase M8 — Android Internal Build

## เป้าหมาย

สร้าง Preview APK จาก EAS Cloud และตรวจบน Android เครื่องจริงก่อนสร้าง Production AAB

## สิ่งที่แก้

- ผูก build profile กับ EAS Environment โดยตรง
- Preview สร้าง APK สำหรับ internal distribution
- Production สร้าง AAB และ auto-increment version code
- Release checker ไม่บังคับมี `.env` local
- Release checkerตรวจ profile, environment mapping, plugins และ version
- ปรับ app version ให้ตรงกับ package version `0.2.0`

## EAS Preview Environment ที่ต้องมี

```text
EXPO_PUBLIC_API_URL
EXPO_PUBLIC_WS_URL
EXPO_PUBLIC_FIREBASE_API_KEY
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN
EXPO_PUBLIC_FIREBASE_PROJECT_ID
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
EXPO_PUBLIC_FIREBASE_APP_ID
```

ห้ามเพิ่ม Firebase Admin private key, Database URL, Device Secret หรือ Render API key

## ตรวจ EAS Environment

```powershell
Set-Location "D:\IoT Project\dotwatch\apps\mobile"
npx eas-cli whoami
npx eas-cli project:info
npx eas-cli env:list --environment preview
```

หากตัวแปรขาด ให้เพิ่มผ่าน Expo Dashboard หรือ EAS CLI เฉพาะตัวที่ยังไม่มี:

```powershell
$Value = Read-Host "EXPO_PUBLIC_API_URL"
npx eas-cli env:create `
  --name EXPO_PUBLIC_API_URL `
  --value $Value `
  --environment preview `
  --visibility plaintext
Remove-Variable Value
```

## ตรวจโค้ดก่อน Build

```powershell
Set-Location "D:\IoT Project\dotwatch"
npm --prefix apps/mobile install
npm run check:mobile
npm --prefix apps/mobile run check:release
npm run scan:secrets
```

## สร้าง Preview APK

```powershell
Set-Location "D:\IoT Project\dotwatch\apps\mobile"
npx eas-cli build `
  --platform android `
  --profile preview
```

เมื่อถาม Android credentials ให้เลือก Expo จัดการ credentials หากยังไม่มี keystore ของ `com.dotwatch.mobile`

## Smoke Test บน Android จริง

1. ติดตั้ง APK และเปิดโดยไม่เปิด Metro
2. Login สำเร็จและ session อยู่หลังปิด/เปิดแอป
3. Device list/detail โหลดจาก Render
4. Temperature/Humidity และ realtime ทำงาน
5. History chart โหลดได้
6. Alarm list และ acknowledge ทำงาน
7. Offline banner และ reconnect ทำงาน
8. Notification permission และ push token สำเร็จ
9. Alarm push เข้าเครื่องและ deep link ถูกหน้า
10. Logout สำเร็จ

## Production AAB

ทำหลัง Preview APK ผ่านครบ:

```powershell
npx eas-cli env:list --environment production
npx eas-cli build `
  --platform android `
  --profile production
```
