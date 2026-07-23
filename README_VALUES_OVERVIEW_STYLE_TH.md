# dotWatch — Values Tab แบบเดียวกับ Overview

## สิ่งที่ปรับ

หน้า Device Center > Selected Device > Values เปลี่ยนจากรูปแบบตารางแนวนอนเป็น Card แบบเดียวกับ Overview

แต่ละ Value มีหัว Card แสดง:

- Icon
- Value Name
- Metric Key
- Unit

ภายใน Card แยกเป็นแถว:

1. Value Name
2. Unit
3. Decimals
4. Icon
5. Display

รูปแบบของแต่ละแถวใช้มาตรฐานเดียวกับ Overview:

- Border radius 16px
- ความสูงขั้นต่ำ 72px
- สัดส่วนคอลัมน์ซ้าย/ขวาเดียวกัน
- Typography ของ Label, Description และค่าหลักชุดเดียวกัน
- ใช้เส้นแบ่งระหว่างแถว
- Responsive เป็นหนึ่งคอลัมน์บนหน้าจอขนาดเล็ก

## ฟังก์ชันที่ยังอยู่ครบ

- แก้ Value Name
- แก้ Unit
- เลือก Decimals
- เลือก Icon
- Visible / Hidden
- Add Value
- Delete Value
- Reset Values
- Save Values
- Fixed Model ยังคงล็อก Value Name, Unit และ Icon
- Scrollbar เมื่อ Value มากกว่า 3 รายการ
- แท็บ Alarms ยังคงแยกและอ้างอิง Value ชุดเดียวกัน

## วิธีติดตั้ง

1. แตกไฟล์ `dotwatch-selected-device-values-overview-style-patch-20260722.zip`
2. นำโฟลเดอร์ `dotwatch` วางทับ:

   `D:\IoT Project\dotwatch`

3. ตรวจสอบ:

```powershell
cd "D:\IoT Project\dotwatch"

node .\scripts\verify-selected-device-values-overview-style.mjs
npm --prefix apps/dashboard run build
```

4. Push ตามไฟล์ `GIT_PUSH_COMMANDS_VALUES_OVERVIEW_STYLE_TH.txt`

## Render

หลัง Push:

1. เปิด Render Dashboard service
2. Manual Deploy
3. Clear build cache & deploy
4. ตรวจ Commit SHA ให้ตรงกับ GitHub main
5. เปิดหน้า Dashboard แล้วกด `Ctrl + F5`

งานนี้แก้เฉพาะ Dashboard ไม่แก้ Backend และไม่ต้องรัน Database Migration
