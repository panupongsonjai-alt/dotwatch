# dotWatch — Device Center Selected Device Layout

## สิ่งที่ปรับ

### 1. Display Fields & Alarm Rules

- เมื่อ Device มี Value ไม่เกิน 3 รายการ จะแสดงทั้งหมดโดยไม่มี Scrollbar
- เมื่อ Device มี Value มากกว่า 3 รายการ ระบบจะจำกัดความสูงไว้เท่ากับ 3 Value แรกและเพิ่ม Vertical Scrollbar
- ความสูงคำนวณจากขนาดจริงของ Value Card ทั้ง 3 รายการ จึงรองรับ Alarm Rule ที่มีความสูงแตกต่างกัน
- Scrollbar อยู่เฉพาะรายการ Value ส่วนหัว `Display Fields & Alarm Rules` และหัวตารางยังมองเห็นตามปกติ
- เมื่อเปิด Icon Dropdown ระบบจะปลดการตัดพื้นที่ชั่วคราว เพื่อให้รายการ Icon แสดงได้ครบ
- รองรับ Desktop, Tablet และ Mobile

### 2. Security

Security ใช้รูปแบบเดียวกับ Overview ได้แก่:

- พื้นหลังและเส้นขอบแบบเดียวกัน
- Border radius `16px`
- ความสูง Row `72px`
- Column และ spacing แบบเดียวกัน
- ชื่อหัวข้อ `13px`
- ข้อความอธิบาย `11px`
- ค่าหลัก `15px`
- Mobile เปลี่ยนเป็น Layout หนึ่งคอลัมน์เหมือน Overview

ขั้นตอนด้านความปลอดภัยเดิมยังอยู่ครบ:

- Device Secret ถูกซ่อน
- ต้องยืนยัน Password ก่อนเปิดเผย Secret
- Reset Secret ต้องยืนยัน Password และยืนยันคำสั่งอีกครั้ง

## วิธีติดตั้ง

1. แตกไฟล์ `dotwatch-selected-device-center-layout-patch-20260722.zip`
2. นำโฟลเดอร์ `dotwatch` วางทับที่:

   `D:\IoT Project\dotwatch`

3. ตรวจสอบ:

```powershell
cd "D:\IoT Project\dotwatch"

node .\scripts\verify-selected-device-center-layout.mjs
npm --prefix apps/dashboard run build
```

4. Push ตามไฟล์ `GIT_PUSH_COMMANDS_SELECTED_DEVICE_CENTER_LAYOUT_TH.txt`

## Render

หลัง Push ให้เปิด Dashboard service แล้วเลือก:

`Manual Deploy → Clear build cache & deploy`

ตรวจว่า Render Deploy จาก Commit SHA เดียวกับ `origin/main` แล้วกด `Ctrl + F5`

งานนี้แก้เฉพาะ Dashboard ไม่แก้ Backend และไม่ต้องรัน Database Migration
