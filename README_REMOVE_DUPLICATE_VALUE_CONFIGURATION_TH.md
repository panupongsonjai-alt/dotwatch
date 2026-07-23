# dotWatch — ลบส่วนสรุปซ้ำใน Values & Alarms

## สิ่งที่ปรับ

หน้า `Device Center > Selected Device > Values & Alarms` จะไม่แสดงกล่องสรุปซ้ำด้านบนอีกต่อไป ได้แก่:

- `Value Configuration`
- `Display Fields & Alarm Rules`
- คำอธิบายโมเดล Fixed Value
- จำนวน `Values`
- จำนวน `Visible`
- จำนวน `Active Rules`
- ป้าย `Fixed 2 Values`

หลังหัวข้อหน้า `Values & Alarms` ระบบจะเข้าสู่รายการตั้งค่า Value โดยตรง

## ฟังก์ชันที่ยังคงอยู่

- Temperature และ Humidity ของ `dot-TH-W1` และ `dot-WT-W1`
- การตั้งค่า Decimal และ Display
- Warning / Critical Alarm Rules
- Reset
- Save All Settings
- Scrollbar เมื่อมี Value มากกว่า 3 รายการ
- การคำนวณความสูงจาก 3 Value แรก
- Security layout และ Typography ที่ปรับไว้ก่อนหน้า

สำหรับโมเดลที่เพิ่มหรือลบ Value ได้ ปุ่ม `Add Value` ยังอยู่ แต่เปลี่ยนเป็น Action ขนาดกะทัดรัดเหนือรายการ โดยไม่มีหัวข้อสรุปซ้ำ

## วิธีติดตั้ง

1. แตกไฟล์ `dotwatch-remove-duplicate-value-configuration-patch-20260722.zip`
2. นำโฟลเดอร์ `dotwatch` วางทับที่:

   `D:\IoT Project\dotwatch`

3. ตรวจสอบ:

```powershell
cd "D:\IoT Project\dotwatch"

node .\scripts\verify-values-alarms-simplified-header.mjs
npm --prefix apps/dashboard run build
```

งานนี้แก้เฉพาะ Dashboard ไม่แก้ Backend และไม่ต้องรัน Database Migration
