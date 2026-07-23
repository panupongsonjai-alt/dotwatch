# dotWatch — ปรับหัวและแถวตั้งค่า Alarms

## รูปแบบใหม่

หน้า Device Center > Selected Device > Alarms:

### หัว Value Card

เอา `Visible / Hidden` ออก และแทนด้วย:

- Warning + ปุ่ม Active / Paused
- Critical + ปุ่ม Active / Paused

ทั้งสองกลุ่มอยู่ด้านขวาของชื่อ Value และ Icon

### ข้อมูล Alarm

สำหรับ Warning และ Critical แต่ละระดับ จะแสดงในแถวเดียวกัน:

1. Condition
2. Threshold พร้อม Unit เช่น `Threshold (°C)`
3. Notification Message

หัว Warning/Critical และปุ่ม Active ที่เคยซ้ำอยู่ในเนื้อหาด้านล่างถูกนำออกแล้ว

## Responsive

- Desktop: Condition, Threshold และ Notification Message อยู่ในแถวเดียวกัน
- พื้นที่ไม่เกิน 760px: Notification Message ลงเป็นแถวเต็มด้านล่าง
- พื้นที่ไม่เกิน 560px: เรียงทุกช่องบน–ล่าง
- หัว Warning/Critical สามารถย้ายลงเป็นแถวถัดไปเมื่อพื้นที่ไม่พอ

## ฟังก์ชันที่ยังอยู่ครบ

- Warning และ Critical
- Active / Paused
- Condition
- Threshold
- Notification Message
- Save Alarms
- Reset Alarm Drafts
- แสดงทุก Value จากแท็บ Values
- Scrollbar เมื่อมี Value มากกว่า 3 รายการ

## วิธีติดตั้ง

1. แตก `dotwatch-selected-device-alarm-compact-header-patch-20260722.zip`
2. วางโฟลเดอร์ `dotwatch` ทับที่:

   `D:\IoT Project\dotwatch`

3. ตรวจสอบ:

```powershell
cd "D:\IoT Project\dotwatch"

node .\scripts\verify-selected-device-alarm-compact-header.mjs
npm --prefix apps/dashboard run build
```

4. Push ตามไฟล์ `GIT_PUSH_COMMANDS_ALARM_COMPACT_HEADER_TH.txt`

## Render

หลัง Push ให้ Deploy เฉพาะ Dashboard:

- Manual Deploy
- Clear build cache & deploy
- ตรวจ Commit SHA
- กด `Ctrl + F5`

ไม่แก้ Backend และไม่ต้องรัน Database Migration
