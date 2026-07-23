# Validation — Value Visible Header

ผลตรวจสอบ:

- ปุ่ม Visible / Hidden อยู่ใน Value Card header
- ตำแหน่งเรียง Icon → ชื่อ Value → Visible/Hidden
- ลบแถว Display เดิมแล้ว
- Event update `visible` ยังอยู่
- Accessible label อยู่ครบ
- Desktop และ Mobile CSS อยู่ครบ
- ปุ่มไม่มีเงา
- Value Name + Unit และ Decimals + Icon ยังอยู่
- Fixed Model lock ยังอยู่
- ZIP integrity ผ่าน
- ไม่แก้ Backend หรือ Database
- ไม่ต้องรัน Migration

ก่อน Push ให้รัน:

```powershell
node .\scripts\verify-selected-device-value-visible-header.mjs
npm --prefix apps/dashboard run build
```
