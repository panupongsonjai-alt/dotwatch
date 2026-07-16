# dotWatch Mobile Phase M5 — Push Registration

Phase นี้เพิ่ม:

- ขอ Notification permission
- สร้าง Expo Push Token
- ลงทะเบียน Token กับ Render Backend
- ตาราง `mobile_push_tokens`
- หน้า Notifications
- Deep link จาก Notification ผ่าน `data.url`
- Backend endpoints:
  - `GET /api/mobile-push/status`
  - `POST /api/mobile-push/register`
  - `POST /api/mobile-push/unregister`

## ติดตั้ง

คัดลอก patch ลง repository แล้วรัน:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File ".\scripts\install-mobile-phase-m5.ps1" `
  -RepoRoot "D:\IoT Project\dotwatch"
```

## ตั้ง EAS Project ID

สร้าง Expo project/EAS project ก่อน แล้วเพิ่มใน `apps/mobile/app.json`:

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

## Migration

ตั้ง `DATABASE_URL` เป็น Render External Database URL แล้วรัน:

```powershell
npm --prefix services/backend run mobile-push:migrate
```

หากยังไม่ได้เพิ่ม script ให้รันตรง:

```powershell
node services/backend/scripts/mobile-push-migrate.mjs
```

## ตรวจสอบ

```powershell
node --check services/backend/src/controllers/mobilePush.controller.js
node --check services/backend/src/routes/mobilePush.routes.js
node --check services/backend/src/server.js

npm --prefix apps/mobile run typecheck
```

Remote push บน Android ใช้ Expo Go ไม่ได้ตั้งแต่ SDK 53 ต้องใช้ Development Build หรือ Release Build
