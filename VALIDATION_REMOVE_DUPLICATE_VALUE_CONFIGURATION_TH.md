# Validation — Remove Duplicate Value Configuration

## ผลตรวจสอบที่ผ่าน

- ลบ `Value Configuration` ออกจาก Component แล้ว
- ลบ `Display Fields & Alarm Rules` ออกจาก Component แล้ว
- ลบ Summary `Values / Visible / Active Rules` แล้ว
- ลบป้าย `Fixed 2 Values` จากส่วนซ้ำแล้ว
- โมเดลที่แก้ไขได้ยังมีปุ่ม `Add Value`
- Scrollbar เมื่อ Value มากกว่า 3 รายการยังอยู่
- Reset และ Save All Settings ยังอยู่
- Warning และ Critical Alarm Rules ไม่ถูกแก้ไข
- Device Security ไม่ถูกแก้ไข
- TypeScript JSX parse ผ่าน (`tsc --jsx preserve --noEmit`)
- CSS parse ผ่านด้วย `tinycss2`
- Verification script ผ่าน
- Git whitespace check ผ่าน
- ไม่แก้ Backend หรือ Database
- ไม่ต้องรัน Migration

## Production Build

ไม่สามารถยืนยัน `npm run build` ในสภาพแวดล้อมจัดทำไฟล์ได้ เนื่องจากการติดตั้ง dependency ผ่าน npm ไม่สำเร็จใน runtime นี้

ให้รันบน Local ก่อน Push:

```powershell
npm --prefix apps/dashboard run build
```
