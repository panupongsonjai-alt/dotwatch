# Validation — Alarm Compact Header

## ผลตรวจสอบที่ผ่าน

- ลบ Visible / Hidden จากหัว Alarm Card
- เพิ่ม Warning + Active / Paused ในหัว Card
- เพิ่ม Critical + Active / Paused ในหัว Card
- ลบหัว Warning/Critical ที่ซ้ำในเนื้อหา
- Condition, Threshold และ Notification Message อยู่ใน Row เดียวกันบน Desktop
- Threshold แสดง Unit เดิมของ Value
- Responsive 760px และ 560px อยู่ครบ
- Event `updateAlarmActive` ยังอยู่
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
