# dotWatch — แยกแท็บ Values และ Alarms ใน Selected Device

## ผลลัพธ์

หน้า `Device Center > Selected Device` จะแสดงแท็บดังนี้:

1. Overview
2. Values
3. Alarms
4. Location
5. Security

### แท็บ Values

ใช้สำหรับจัดการข้อมูลของ Value โดยตรง:

- Value Name
- Unit
- Decimals
- Icon
- Display: Visible / Hidden
- Add Value และ Delete Value สำหรับโมเดลที่แก้ไขได้
- Reset Values
- Save Values

สำหรับ `dot-TH-W1` และ `dot-WT-W1` ยังคงล็อกชื่อ หน่วย และ Icon ตาม Device Model เดิม

### แท็บ Alarms

- โหลดรายการจากแหล่ง Value เดียวกับแท็บ Values
- แสดงทุก Value ที่บันทึกอยู่ในแท็บ Values
- แสดง Value ที่ตั้งเป็น Hidden ด้วย เพื่อไม่ให้ Alarm หายจากหน้าจัดการ
- แต่ละ Value มี Warning และ Critical แยกกัน
- ตั้ง Condition, Threshold, Notification Message และ Active ได้
- Reset Alarm Drafts จะคืนค่าตาม Alarm ที่บันทึกล่าสุด โดยไม่ Reset Value
- Save Alarms บันทึกเฉพาะ Alarm Rules ไม่เขียนทับการตั้งค่า Value

> เมื่อเพิ่ม ลบ หรือแก้ Value ให้กด `Save Values` ก่อนเปิดแท็บ Alarms เพื่อให้รายการอ้างอิงเป็นข้อมูลล่าสุดจาก Backend

### Scrollbar

หากรายการเกิน 3 Value:

- แท็บ Values มี Vertical Scrollbar
- แท็บ Alarms มี Vertical Scrollbar
- ความสูงคำนวณจาก 3 Value แรกจริง เพื่อรองรับ Card ที่มีความสูงต่างกัน

## วิธีติดตั้ง

1. แตกไฟล์ `dotwatch-selected-device-values-alarms-tabs-patch-20260722.zip`
2. นำโฟลเดอร์ `dotwatch` วางทับที่:

   `D:\IoT Project\dotwatch`

3. ตรวจสอบ:

```powershell
cd "D:\IoT Project\dotwatch"

node .\scripts\verify-selected-device-values-alarms-tabs.mjs
npm --prefix apps/dashboard run build
```

หากพบ `vite: not found`:

```powershell
npm --prefix apps/dashboard ci
npm --prefix apps/dashboard run build
```

## Render

หลัง Push ให้ Deploy เฉพาะ Dashboard:

1. เปิด Render Dashboard service
2. เลือก `Manual Deploy`
3. เลือก `Clear build cache & deploy`
4. ตรวจว่า Deploy ใช้ Commit SHA ล่าสุดจาก GitHub `main`
5. เปิดหน้าเว็บแล้วกด `Ctrl + F5`

งานนี้ไม่แก้ Backend และไม่ต้องรัน Database Migration
