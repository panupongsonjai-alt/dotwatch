# Validation — Device Code Font Parity

ผลตรวจสอบ:

- Device Code ใช้ `var(--dw-font-sans) !important`
- Device Code ใช้ขนาด `15px`
- Device Code ใช้น้ำหนัก `900`
- Device Code ใช้ line-height `1.35`
- Device Code ใช้ letter spacing ปกติ
- Model ยังคงใช้ Sans font เดิม
- Device Secret และ Code surface อื่นยังใช้ Monospace
- Verification script ผ่าน
- `devices.css` parse ผ่าน
- ZIP integrity ผ่าน
- ไม่แก้ Backend หรือ Database
- ไม่ต้องรัน Migration

Production Build ต้องยืนยันบน Local ด้วย:

```powershell
npm --prefix apps/dashboard run build
```
