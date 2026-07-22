# dotWatch — Selected Device Security Update

วันที่จัดทำ: 22 กรกฎาคม 2026

## ขอบเขตการปรับปรุง

ปรับแท็บ **Security** ในหน้า **Selected Device** ตามข้อกำหนดดังนี้

1. Device Code แสดงเป็นข้อความปกติ ไม่มีกรอบ เส้นขอบ หรือพื้นหลัง
2. นำรายการ Device ID ออกจากแท็บ Security
3. นำรายการ Secret Status ออกจากแท็บ Security
4. Device Secret ถูกซ่อนเป็นจุด และต้องคลิกค่าที่ซ่อนเพื่อเปิด Password modal
5. Reset Secret ต้องผ่าน Password modal ก่อน แล้วจึงผ่าน Typed Confirmation `Reset Secret` อีกครั้ง

## ลำดับการดู Device Secret

1. เปิดหน้า Devices และเลือกอุปกรณ์
2. เปิดแท็บ Security
3. คลิกค่าที่ซ่อนในรายการ Device Secret
4. กรอก Password ของบัญชี Firebase ปัจจุบัน
5. Dashboard เรียก Firebase `reauthenticateWithCredential`
6. Dashboard บังคับ Refresh Firebase ID token
7. Backend ตรวจ `auth_time` ว่าผ่านการยืนยันตัวตนภายใน 5 นาที
8. เมื่อผ่าน ระบบจะแสดง Device Secret
9. ผู้ใช้สามารถ Copy หรือ Hide ค่า Secret ได้
10. เมื่อออกจากแท็บ Security ค่า Secret จะถูกล้างออกจากหน้าจอ

## ลำดับการ Reset Device Secret

1. กดปุ่ม Reset Secret
2. ระบบเปิด Password modal
3. กรอก Password ของบัญชีปัจจุบัน
4. Firebase ตรวจสอบ Password และออก ID token ใหม่
5. ระบบเปิด Typed Confirmation อีกครั้ง
6. พิมพ์ `Reset Secret` ให้ตรงตามข้อความ
7. Dashboard เรียก Reset Secret API โดยบังคับ Refresh ID token
8. Backend ตรวจ `auth_time` ภายใน 5 นาที
9. Backend สร้าง Secret ใหม่และทำให้ Secret เดิมใช้งานไม่ได้

## การป้องกันการเรียก API โดยตรง

Endpoint ต่อไปนี้ถูกครอบด้วย middleware `requireRecentAuthentication`

- `GET /api/devices/:id/secret`
- `POST /api/devices/:id/reset-secret`

หาก Firebase ID token ไม่มี `auth_time` หรือยืนยันตัวตนเกิน 5 นาที Backend จะตอบกลับ:

```json
{
  "code": "RECENT_AUTH_REQUIRED",
  "message": "กรุณายืนยันรหัสผ่านของบัญชีอีกครั้งก่อนดูหรือ Reset Device Secret",
  "maxAuthAgeSeconds": 300
}
```

## ไฟล์ที่แก้ไข

- `apps/dashboard/src/components/devices/SelectedDevicePanel.jsx`
- `apps/dashboard/src/services/api.js`
- `apps/dashboard/src/styles/devices.css`
- `services/backend/src/middlewares/authUser.js`
- `services/backend/src/middlewares/requireRecentAuthentication.js`
- `services/backend/src/routes/devices.routes.js`
- `scripts/verify-selected-device-security.mjs`

## วิธีติดตั้ง Patch

1. สำรองโปรเจกต์ปัจจุบันก่อน
2. แตกไฟล์ Patch ZIP
3. Copy โฟลเดอร์ `dotwatch` จาก Patch ไปวางทับที่:

```text
D:\IoT Project\dotwatch
```

4. เลือก Replace files in the destination
5. ไม่ต้องรัน Database Migration

## ตรวจสอบหลังวางไฟล์

เปิด PowerShell:

```powershell
cd "D:\IoT Project\dotwatch"
node .\scripts\verify-selected-device-security.mjs
```

ผลที่ถูกต้อง:

```text
Selected Device Security verification passed.
- Device ID and Secret Status removed
- Device Code rendered without frame
- Secret reveal requires password modal
- Reset requires password modal and typed confirmation
- Backend requires recent Firebase authentication
```

ตรวจ Dashboard build:

```powershell
npm --prefix apps/dashboard ci
npm --prefix apps/dashboard run build:production
```

ตรวจ Backend syntax:

```powershell
npm --prefix services/backend run check:syntax
node --check services/backend/src/middlewares/requireRecentAuthentication.js
node --check services/backend/src/middlewares/authUser.js
node --check services/backend/src/routes/devices.routes.js
```

## ทดสอบบนระบบจริง

### ดู Secret — กรณีผ่าน

1. เลือก Device
2. เปิด Security
3. คลิกค่าที่ซ่อน
4. กรอก Password ที่ถูกต้อง
5. Secret ต้องแสดง
6. กด Copy ต้องคัดลอกค่าได้
7. กด Hide หรือออกจากแท็บ Security ค่า Secret ต้องหาย

### ดู Secret — กรณีไม่ผ่าน

1. กรอก Password ผิด
2. Modal ต้องไม่ปิด
3. ต้องแสดงข้อความ `Password ไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง`
4. Secret ต้องไม่แสดง

### Reset Secret — กรณีผ่าน

1. กด Reset Secret
2. กรอก Password ถูกต้อง
3. ต้องเปิดหน้าต่างยืนยันขั้นที่สอง
4. พิมพ์ `Reset Secret`
5. ระบบต้องแสดง Secret ใหม่
6. Firmware หรือ Gateway ต้องเปลี่ยนไปใช้ Secret ใหม่

### Reset Secret — กรณีไม่ผ่าน

- Password ผิด: ต้องไม่เปิดหน้าต่างยืนยันขั้นที่สอง
- ยกเลิก Typed Confirmation: ต้องไม่ Reset
- เรียก API ด้วย token เก่ากว่า 5 นาที: Backend ต้องตอบ `403 RECENT_AUTH_REQUIRED`

## การ Deploy บน Render

หลัง Push GitHub:

1. Deploy Backend service
2. Deploy Dashboard service
3. ไม่ต้องรัน `npm run migrate`
4. ทดสอบดู Secret และ Reset Secret ด้วยบัญชีจริง
5. ตรวจ Backend logs ว่าไม่มี `RECENT_AUTH_REQUIRED` หลังกรอก Password ถูกต้อง

## หมายเหตุด้านความปลอดภัย

- Password ไม่ถูกส่งเข้า dotWatch Backend
- Password ถูกตรวจโดย Firebase Authentication ผ่าน Client SDK
- Backend ได้รับเฉพาะ Firebase ID token
- Backend ตรวจเวลายืนยันตัวตนจาก claim `auth_time`
- Device Secret endpoint ไม่ถูก cache ใน Dashboard
- Secret ถูกล้างเมื่อเปลี่ยน Device หรือออกจากแท็บ Security
