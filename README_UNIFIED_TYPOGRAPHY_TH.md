# dotWatch — Unified Typography System

## มาตรฐาน Font ใหม่

ระบบเว็บทั้งหมดใช้ Font Stack เดียวกัน:

```css
"Inter", "Prompt", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif
```

พฤติกรรมที่ได้:

- ภาษาอังกฤษ ตัวเลข และข้อความ Latin ใช้ `Inter`
- ภาษาไทยใช้ `Prompt`
- หาก Google Fonts โหลดไม่ได้ ระบบใช้ Font ของระบบปฏิบัติการตามลำดับ fallback
- Device Code, Secret, Console, JSON และข้อมูลเชิงเทคนิคยังใช้ Monospace เพื่อให้อ่านรหัสได้ชัดเจน

## จุดที่ครอบคลุม

- Dashboard ทุกหน้า
- Admin ทุกหน้า
- Button, Input, Select, Textarea และ Dropdown
- Table, Filter และ Modal
- Chart SVG, Map, Tooltip และ Popup
- Printable Report / PDF browser output
- ESP32 Setup Portal
- ESP8266 Setup Portal
- Raspberry Pi Configuration UI

## สิ่งที่เปลี่ยนในโค้ด

- เพิ่ม `--dw-font-sans` และ `--dw-font-mono` เป็น Typography Token กลาง
- เพิ่ม `typography-system.css` แยกสำหรับ Dashboard และ Admin
- Import Typography layer เป็นลำดับสุดท้าย เพื่อแก้ CSS เก่าที่กำหนด Font ซ้ำ
- Admin โหลด `Prompt` เพิ่ม เพื่อให้ภาษาไทยไม่ตกไปใช้ Font คนละชุด
- เพิ่มน้ำหนัก `Prompt 900` ให้หัวข้อภาษาไทยที่ใช้ตัวหนาแสดงผลจริง ไม่ใช้ Synthetic Bold
- Printable Reports โหลด Inter และ Prompt ชุดเดียวกับหน้าเว็บ
- Raspberry Pi form controls รับ Font จากหน้าเว็บหลักเหมือนกัน

## การติดตั้ง

1. แตกไฟล์ `dotwatch-unified-typography-patch-20260722.zip`
2. นำโฟลเดอร์ `dotwatch` วางทับ:

```text
D:\IoT Project\dotwatch
```

3. ตรวจสอบ:

```powershell
cd "D:\IoT Project\dotwatch"

node .\scripts\verify-unified-typography.mjs
python -m py_compile .\pi\agent\pi_config_web.py

npm --prefix apps/dashboard run build
npm --prefix apps/admin run build
```

4. Push ตามไฟล์ `GIT_PUSH_COMMANDS_UNIFIED_TYPOGRAPHY_TH.txt`

## Render

หลัง Push ให้ Deploy Dashboard และ Admin จาก Commit เดียวกัน:

- Dashboard: `Manual Deploy` → `Clear build cache & deploy`
- Admin: `Manual Deploy` → `Clear build cache & deploy`

Backend และฐานข้อมูลไม่มีการเปลี่ยนแปลง จึงไม่ต้องรัน Migration

## หมายเหตุ Mobile App

รอบนี้ปรับระบบเว็บและ Web UI ของอุปกรณ์ทั้งหมด Mobile App แบบ Native ยังใช้ Font ของระบบปฏิบัติการ เพราะการทำให้เป็น Inter/Prompt ต้องเพิ่มและ Bundle Font Binary ใน Mobile Build แยกต่างหาก
