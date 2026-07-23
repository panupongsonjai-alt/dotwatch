# Validation — Values Tab Overview Style

## ผลตรวจสอบที่ผ่าน

- Values แสดงเป็น Overview-style Card
- แต่ละ Value มีหัว Card พร้อม Icon, Name, Key และ Unit
- Value Name, Unit, Decimals, Icon และ Display แยกเป็นแถว
- ใช้สัดส่วนคอลัมน์เดียวกับ Overview
- ใช้ความสูงขั้นต่ำ 72px แบบเดียวกับ Overview
- ใช้ Border radius 16px
- ลบหัวตาราง Value Name / Unit / Decimals / Icon / Display แบบเดิม
- Scrollbar เมื่อ Value มากกว่า 3 รายการยังอยู่
- Values และ Alarms ยังแยกแท็บ
- Fixed Model lock ยังอยู่
- Add/Delete/Reset/Save Values ยังอยู่
- JSX parse ผ่านด้วย TypeScript transpile parser
- CSS parse ผ่านด้วย tinycss2
- Verification script ผ่าน
- ZIP integrity ผ่าน
- ไม่แก้ Backend หรือ Database
- ไม่ต้องรัน Migration

## Production Build

ไม่สามารถยืนยัน Production Build ในสภาพแวดล้อมจัดทำไฟล์ได้ เนื่องจากไม่มี Dashboard dependencies และคำสั่งหยุดที่:

```text
vite: not found
```

ให้รันบน Local:

```powershell
npm --prefix apps/dashboard ci
npm --prefix apps/dashboard run build
```
