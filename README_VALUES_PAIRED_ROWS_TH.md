# dotWatch — Values แบบสองช่องต่อแถว

## รูปแบบใหม่

หน้า Device Center > Selected Device > Values แสดงข้อมูลภายในแต่ละ Value Card ดังนี้:

### แถวที่ 1
- Value Name
- Unit

### แถวที่ 2
- Decimals
- Icon

### แถวที่ 3
- Display

บน Desktop และ Tablet ช่องที่จับคู่จะแสดงเคียงกันในแถวเดียว

เมื่อพื้นที่แสดงผลแคบกว่า 700px ระบบจะเรียงช่องในแต่ละคู่เป็นบน–ล่างอัตโนมัติ เพื่อให้ช่องกรอกและ Icon Dropdown ใช้งานได้สะดวก

## ฟังก์ชันที่ยังอยู่ครบ

- รูปแบบ Card เดียวกับ Overview
- แก้ Value Name
- แก้ Unit
- เลือก Decimals
- เลือก Icon
- Visible / Hidden
- Fixed Model lock
- Add และ Delete Value
- Reset และ Save Values
- Scrollbar เมื่อมี Value มากกว่า 3 รายการ
- แท็บ Alarms ยังคงแยกและอ้างอิง Value ชุดเดียวกัน

## วิธีติดตั้ง

1. แตกไฟล์ `dotwatch-selected-device-values-paired-rows-patch-20260722.zip`
2. นำโฟลเดอร์ `dotwatch` วางทับ:

   `D:\IoT Project\dotwatch`

3. ตรวจสอบ:

```powershell
cd "D:\IoT Project\dotwatch"

node .\scripts\verify-selected-device-values-paired-rows.mjs
npm --prefix apps/dashboard run build
```

4. Push ตามไฟล์ `GIT_PUSH_COMMANDS_VALUES_PAIRED_ROWS_TH.txt`

## Render

หลัง Push:

1. เปิด Render Dashboard service
2. เลือก Manual Deploy
3. เลือก Clear build cache & deploy
4. ตรวจ Commit SHA ให้ตรงกับ GitHub main
5. เปิดหน้า Dashboard แล้วกด `Ctrl + F5`

งานนี้แก้เฉพาะ Dashboard ไม่แก้ Backend และไม่ต้องรัน Database Migration
