# Validation — Values Clean Feedback

## ผลตรวจสอบที่ผ่าน

- ลบ Toast success ของ Save Values
- ลบ Toast success ของ Save Alarms
- ลบ Toast error ซ้ำจาก MetricConfigPanel
- คง Inline panel feedback
- ลบคำอธิบายใต้ Value Name
- ลบคำอธิบายใต้ Unit
- ลบคำอธิบายใต้ Decimals
- ลบคำอธิบายใต้ Icon
- Label และ Input ทุกช่องยังอยู่
- Visible / Hidden header toggle ยังอยู่
- Verification script ผ่าน
- ZIP integrity ผ่าน
- ไม่แก้ Backend หรือ Database
- ไม่ต้องรัน Migration

## Production Build

ให้ยืนยันบน Local ก่อน Push:

```powershell
npm --prefix apps/dashboard run build
```

หากพบ `vite: not found`:

```powershell
npm --prefix apps/dashboard ci
npm --prefix apps/dashboard run build
```
