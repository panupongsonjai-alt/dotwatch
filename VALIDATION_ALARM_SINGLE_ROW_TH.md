# Validation — Alarm Single Row

## ผลตรวจสอบที่ผ่าน

- เอา Warning/Critical controls ออกจากหัว Value Card
- Warning/Critical เป็นคอลัมน์แรกของแต่ละ Alarm row
- Condition เป็นคอลัมน์ที่สอง
- Threshold พร้อม Unit เป็นคอลัมน์ที่สาม
- Notification Message เป็นคอลัมน์ที่สี่
- Active/Paused เป็นคอลัมน์สุดท้าย
- Active/Paused ยังเปลี่ยนตามสถานะจริง
- Desktop ใช้ 5-column grid
- Responsive breakpoints 900px, 620px และ 430px อยู่ครบ
- Verification script ผ่าน
- CSS parse ผ่าน
- ZIP integrity ผ่าน
- ไม่แก้ Backend หรือ Database
- ไม่ต้องรัน Migration

## Production Build

ให้ตรวจบน Local:

```powershell
npm --prefix apps/dashboard run build
```

หากพบ `vite: not found`:

```powershell
npm --prefix apps/dashboard ci
npm --prefix apps/dashboard run build
```
