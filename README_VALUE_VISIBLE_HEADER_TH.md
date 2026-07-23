# dotWatch — ย้าย Visible ไปไว้บนหัว Value Card

## รูปแบบใหม่

หน้า Device Center > Selected Device > Values:

- ปุ่ม `Visible / Hidden` ย้ายไปอยู่มุมขวาบนของ Value Card
- ตำแหน่งอยู่ในแถวเดียวกับ Icon และชื่อ Value
- ลบแถว `Display` ด้านล่างออก
- Card เหลือ:
  - Value Name + Unit
  - Decimals + Icon

## การทำงาน

- คลิกปุ่มเพื่อสลับ `Visible` และ `Hidden` ได้เหมือนเดิม
- ค่า Visibility ยังถูกบันทึกผ่าน `Save Values`
- ใช้ได้กับ Fixed Model และโมเดลทั่วไป
- Fixed Model ยังคงล็อก Value Name, Unit และ Icon
- Add/Delete/Reset/Save และ Scrollbar มากกว่า 3 Value ยังอยู่ครบ
- แท็บ Alarms ยังอ้างอิง Value ชุดเดียวกัน

## วิธีติดตั้ง

1. แตก `dotwatch-selected-device-value-visible-header-patch-20260722.zip`
2. วางโฟลเดอร์ `dotwatch` ทับที่:

   `D:\IoT Project\dotwatch`

3. ตรวจสอบ:

```powershell
cd "D:\IoT Project\dotwatch"

node .\scripts\verify-selected-device-value-visible-header.mjs
npm --prefix apps/dashboard run build
```

4. Push ตามไฟล์ `GIT_PUSH_COMMANDS_VALUE_VISIBLE_HEADER_TH.txt`

## Render

หลัง Push ให้ Deploy เฉพาะ Dashboard:

- Manual Deploy
- Clear build cache & deploy
- ตรวจ Commit SHA
- กด `Ctrl + F5`

ไม่แก้ Backend และไม่ต้องรัน Database Migration
