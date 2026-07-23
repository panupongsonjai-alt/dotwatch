# dotWatch — Alarms แบบเดียวกับ Values

## รูปแบบใหม่

หน้า Device Center > Selected Device > Alarms จะแสดงหนึ่ง Card ต่อหนึ่ง Value โดยใช้รูปแบบเดียวกับแท็บ Values

หัว Card แสดง:

- Icon
- Value Name
- Metric Key
- Unit
- สถานะ Visible / Hidden

ภายใน Value Card แบ่งเป็น Warning และ Critical

แต่ละระดับ Alarm มี:

- Active / Paused อยู่มุมขวาบน
- Condition อยู่แถวเดียวกับ Threshold
- Notification Message อยู่แถวถัดไป

## การอ้างอิง Value

หน้า Alarms ยังคงแสดงทุก Value จากข้อมูลชุดเดียวกับแท็บ Values รวมถึง Value ที่ตั้งเป็น Hidden

เมื่อเพิ่ม ลบ หรือเปลี่ยน Value ให้กด Save Values ก่อน แล้วหน้า Alarms จะอ้างอิงข้อมูลล่าสุดจาก Backend

## Responsive

- Desktop และ Tablet: Condition กับ Threshold แสดงคู่กัน
- หน้าจอแคบกว่า 700px: Condition และ Threshold เรียงบน–ล่าง
- หากมี Value มากกว่า 3 รายการ: ใช้ Vertical Scrollbar ตามระบบเดิม

## ฟังก์ชันที่ยังอยู่ครบ

- Warning
- Critical
- Condition
- Threshold
- Notification Message
- Active / Paused
- Reset Alarm Drafts
- Save Alarms
- แสดงทุก Value รวม Hidden
- แยกการบันทึก Values และ Alarms

## วิธีติดตั้ง

1. แตกไฟล์ `dotwatch-selected-device-alarms-values-style-patch-20260722.zip`
2. นำโฟลเดอร์ `dotwatch` วางทับ:

   `D:\IoT Project\dotwatch`

3. ตรวจสอบ:

```powershell
cd "D:\IoT Project\dotwatch"

node .\scripts\verify-selected-device-alarms-values-style.mjs
npm --prefix apps/dashboard run build
```

4. Push ตามไฟล์ `GIT_PUSH_COMMANDS_ALARMS_VALUES_STYLE_TH.txt`

## Render

หลัง Push ให้ Deploy เฉพาะ Dashboard:

1. Manual Deploy
2. Clear build cache & deploy
3. ตรวจ Commit SHA ให้ตรงกับ GitHub main
4. เปิดหน้าเว็บแล้วกด `Ctrl + F5`

งานนี้ไม่แก้ Backend และไม่ต้องรัน Database Migration
