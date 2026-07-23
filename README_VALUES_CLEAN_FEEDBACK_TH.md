# dotWatch — ลดข้อความซ้ำในแท็บ Values

## สิ่งที่ปรับ

หน้า Device Center > Selected Device > Values:

1. ลบ Toast ลอยมุมขวาบนที่เกิดจากการบันทึก Values และ Alarms
2. คงผลการบันทึกภายในแท็บไว้เพียงจุดเดียว
3. ลบข้อความอธิบายใต้หัวข้อต่อไปนี้:
   - Value Name
   - Unit
   - Decimals
   - Icon

หัวข้อ ช่องตั้งค่า และการทำงานทั้งหมดยังคงอยู่ครบ

## สิ่งที่ไม่เปลี่ยน

- Save Values
- Save Alarms
- การแสดงข้อความสำเร็จหรือผิดพลาดภายในแท็บ
- Value Name + Unit อยู่แถวเดียวกัน
- Decimals + Icon อยู่แถวเดียวกัน
- Visible / Hidden อยู่มุมขวาบน
- Fixed Model lock
- Add/Delete/Reset
- Scrollbar เมื่อ Value มากกว่า 3 รายการ

## วิธีติดตั้ง

1. แตก `dotwatch-selected-device-values-clean-feedback-patch-20260722.zip`
2. วางโฟลเดอร์ `dotwatch` ทับที่:

   `D:\IoT Project\dotwatch`

3. ตรวจสอบ:

```powershell
cd "D:\IoT Project\dotwatch"

node .\scripts\verify-selected-device-values-clean-feedback.mjs
npm --prefix apps/dashboard run build
```

4. Push ตามไฟล์ `GIT_PUSH_COMMANDS_VALUES_CLEAN_FEEDBACK_TH.txt`

## Render

หลัง Push ให้ Deploy เฉพาะ Dashboard:

- Manual Deploy
- Clear build cache & deploy
- ตรวจ Commit SHA
- เปิดหน้าเว็บแล้วกด `Ctrl + F5`

งานนี้ไม่แก้ Backend และไม่ต้องรัน Database Migration
