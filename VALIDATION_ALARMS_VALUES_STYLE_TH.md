# Validation — Alarms Values Style

## ผลตรวจสอบที่ผ่าน

- Alarms ใช้หนึ่ง Overview-style Card ต่อหนึ่ง Value
- หัว Card ใช้โครงสร้างเดียวกับ Values
- แสดง Icon, Value Name, Metric Key และ Unit
- แสดง Visible / Hidden จาก Value ต้นทาง
- Warning และ Critical อยู่ภายใน Value Card
- Active / Paused อยู่ในหัวของแต่ละระดับ Alarm
- Condition อยู่แถวเดียวกับ Threshold
- Notification Message อยู่แถวถัดไป
- Alarms ยัง render ทุก Value จาก draftMetrics
- ลบแถบข้อความอธิบายเฉพาะ Alarms เพื่อให้รูปแบบตรงกับ Values
- Responsive breakpoint ที่ 700px
- Scrollbar เมื่อ Value มากกว่า 3 รายการยังอยู่
- JSX syntax parse ผ่านด้วย TypeScript compiler
- CSS parse ผ่านด้วย tinycss2
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
