# dotWatch — Alarms แบบหนึ่งแถวต่อระดับ

## รูปแบบใหม่

หน้า Device Center > Selected Device > Alarms จัดแต่ละ Alarm เป็นแถวเดียว:

```text
Warning  | Condition | Threshold (Unit) | Notification Message | Active
Critical | Condition | Threshold (Unit) | Notification Message | Paused
```

หัว Value Card เหลือเฉพาะ:

- Icon
- Value Name
- Metric Key
- Unit

Warning/Critical และปุ่ม Active/Paused ถูกย้ายลงมาอยู่ในแถวข้อมูลของระดับ Alarm เดียวกัน

## Responsive

- Desktop: ทั้ง 5 ส่วนอยู่ในแถวเดียว
- พื้นที่ไม่เกิน 900px: Notification Message ลงเป็นแถวเต็ม
- พื้นที่ไม่เกิน 620px: แบ่งเป็นสองคอลัมน์
- พื้นที่ไม่เกิน 430px: เรียงบน–ล่าง

## ฟังก์ชันที่ยังอยู่ครบ

- Warning และ Critical
- Condition
- Threshold พร้อม Unit
- Notification Message
- Active / Paused
- Reset Alarm Drafts
- Save Alarms
- อ้างอิงทุก Value จากแท็บ Values
- Scrollbar เมื่อมี Value มากกว่า 3 รายการ

## วิธีติดตั้ง

1. แตก `dotwatch-selected-device-alarm-single-row-patch-20260722.zip`
2. วางโฟลเดอร์ `dotwatch` ทับที่:

   `D:\IoT Project\dotwatch`

3. ตรวจสอบ:

```powershell
cd "D:\IoT Project\dotwatch"

node .\scripts\verify-selected-device-alarm-single-row.mjs
npm --prefix apps/dashboard run build
```

4. Push ตามไฟล์ `GIT_PUSH_COMMANDS_ALARM_SINGLE_ROW_TH.txt`

## Render

หลัง Push ให้ Deploy เฉพาะ Dashboard:

- Manual Deploy
- Clear build cache & deploy
- ตรวจ Commit SHA
- กด `Ctrl + F5`

ไม่แก้ Backend และไม่ต้องรัน Database Migration
