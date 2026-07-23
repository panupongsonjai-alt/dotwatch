# dotWatch — Device Code Font ให้เหมือน Model

## สิ่งที่ปรับ

หน้า **Device Center > Selected Device > Security**:

- ค่า Device Code เช่น `DW-1784687686183` ใช้ Font เดียวกับค่า Model เช่น `dot-WT-W1`
- ใช้ Sans font มาตรฐานของระบบ: `Inter`, `Prompt`, system fallback
- ขนาด `15px`
- น้ำหนัก `900`
- Line height `1.35`
- ยกเลิก letter spacing แบบ Code

ส่วน Device Secret และข้อมูล Credential อื่นยังใช้ Monospace เพื่อให้อ่านและคัดลอกได้ชัดเจน

## วิธีติดตั้ง

1. แตกไฟล์ `dotwatch-device-code-font-parity-patch-20260722.zip`
2. นำโฟลเดอร์ `dotwatch` วางทับ:

   `D:\IoT Project\dotwatch`

3. ตรวจสอบ:

```powershell
cd "D:\IoT Project\dotwatch"

node .\scripts\verify-device-code-font-parity.mjs
npm --prefix apps/dashboard run build
```

4. Push ตามไฟล์ `GIT_PUSH_COMMANDS_DEVICE_CODE_FONT_PARITY_TH.txt`

## Render

หลัง Push ให้ Deploy เฉพาะ Dashboard:

`Manual Deploy → Clear build cache & deploy`

งานนี้ไม่แก้ Backend และไม่ต้องรัน Database Migration
