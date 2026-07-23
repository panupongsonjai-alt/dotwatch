# Validation — Values Paired Rows

## ผลตรวจสอบที่ผ่าน

- Value Name อยู่แถวเดียวกับ Unit
- Decimals อยู่แถวเดียวกับ Icon
- Display ยังคงเป็นแถวแยก
- Desktop ใช้สองคอลัมน์ขนาดเท่ากัน
- หน้าจอแคบกว่า 700px เรียงช่องเป็นบน–ล่าง
- Overview-style Value Card ยังอยู่
- Fixed Model lock ยังอยู่
- Add/Delete/Reset/Save Values ยังอยู่
- Scrollbar เมื่อ Value มากกว่า 3 รายการยังอยู่
- JSX transpile syntax ผ่าน
- JavaScript syntax ผ่าน
- CSS parse ผ่าน
- Verification script ผ่าน
- ZIP integrity ผ่าน
- ไม่แก้ Backend หรือ Database
- ไม่ต้องรัน Migration

## Production Build

ให้ยืนยันบน Local ก่อน Push:

```powershell
npm --prefix apps/dashboard run build
```

หากพบ `vite: not found` ให้ติดตั้ง dependency ด้วย:

```powershell
npm --prefix apps/dashboard ci
npm --prefix apps/dashboard run build
```
