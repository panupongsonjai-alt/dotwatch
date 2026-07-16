# dotWatch Mobile Phase M5B — Alarm Push Delivery

ติดตั้งต่อจาก Phase M5 Push Registration

## การทำงาน

เมื่อ Alarm Engine ตรวจพบการเปลี่ยนสถานะจาก:

```text
normal -> warning
normal -> critical
warning -> critical
critical -> warning
```

Backend จะสร้าง `alarm_events` สถานะ `active` และส่ง Expo Push
ไปยัง Push Token ที่ active ของผู้ใช้

จะไม่ส่งซ้ำเมื่อค่ารอบใหม่ยังอยู่ในสถานะเดิม และไม่ส่ง Push ตอน recovered/resolved

Notification payload:

```json
{
  "type": "alarm.triggered",
  "alarmId": "123",
  "deviceId": "38",
  "severity": "critical",
  "metric": "temperature",
  "url": "/devices/38"
}
```

เมื่อผู้ใช้แตะ Notification แอปจะเปิดหน้า Device Detail

## ติดตั้ง

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File ".\scripts\install-mobile-phase-m5b.ps1" `
  -RepoRoot "D:\IoT Project\dotwatch"
```

## ตรวจ Syntax

```powershell
node --check ".\services\backend\src\services\mobilePush.service.js"
node --check ".\services\backend\src\services\alarm.service.js"
node --check ".\services\backend\scripts\test-mobile-push.mjs"
```

## ทดสอบ Push โดยตรง

ต้องลงทะเบียน Push Token จาก Mobile App ก่อน

```powershell
$env:DATABASE_URL = "Render External Database URL"
node ".\services\backend\scripts\test-mobile-push.mjs" 1 38
Remove-Item Env:DATABASE_URL
```

เปลี่ยน `1` เป็น user ID และ `38` เป็น device ID จริง

## Deploy

หลัง Push ขึ้น GitHub ให้ Render deploy Backend ใหม่ แล้วตรวจ log:

```text
Alarm push notification failed
Expo push ticket error
```

ถ้าไม่มีข้อความ error และมือถือได้รับ Notification ถือว่าทำงานถูกต้อง
