# Validation — Unified Typography System

## ผลตรวจสอบที่ผ่าน

- Dashboard ใช้ `--dw-font-sans`
- Admin ใช้ `--dw-font-sans`
- Dashboard และ Admin ใช้ Font Stack เดียวกัน
- Admin โหลดทั้ง Inter และ Prompt
- Inter และ Prompt รองรับน้ำหนัก 400–900
- Form controls, Table, Modal, Dropdown, Chart และ Map ใช้ Typography กลาง
- Printable Reports โหลด Font ชุดเดียวกับหน้าเว็บ
- ESP32 Portal ใช้ Font Stack เดียวกัน
- ESP8266 Portal ใช้ Font Stack เดียวกัน
- Raspberry Pi Configuration UI ใช้ Font Stack เดียวกัน
- Technical identifiers ใช้ `--dw-font-mono`
- ไม่พบ Arial, Helvetica, Roboto, Poppins, Tahoma หรือ Verdana ใน Dashboard/Admin CSS
- Verification script ผ่าน
- CSS parse ผ่าน 9 ไฟล์
- Dashboard/Admin JSX parse ผ่าน 4 ไฟล์ด้วย TypeScript transpileModule
- `tableExport.js` ผ่าน `node --check`
- `pi_config_web.py` ผ่าน `py_compile`
- ZIP integrity ผ่าน
- ไม่แก้ Backend หรือ Database
- ไม่ต้องรัน Migration

## Production Build

ไม่สามารถยืนยัน Production Build ภายในสภาพแวดล้อมจัดทำไฟล์ เนื่องจาก Full ZIP ไม่บรรจุ `node_modules` และการติดตั้ง Dependency ไม่สำเร็จ โดยคำสั่ง Build หยุดที่ `vite: not found`

ให้รันบน Local ก่อน Push:

```powershell
npm --prefix apps/dashboard run build
npm --prefix apps/admin run build
```
