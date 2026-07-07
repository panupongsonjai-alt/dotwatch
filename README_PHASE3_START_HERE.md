# dotWatch Phase 3 — Dashboard UX Stabilization

Phase 3 ทำให้ Dashboard มีระบบ UI Preferences และ CSS final stabilization layer ที่ชัดเจนขึ้น โดยไม่รื้อ logic หลักของ Dashboard, Backend หรือ Raspberry Pi Agent

## ติดตั้ง

แตกไฟล์ `dotwatch-phase3-dashboard-ux-stabilization.zip` แล้ววางโฟลเดอร์ `dotwatch` ทับโปรเจกต์เดิม

```powershell
cd "D:\IoT Project\dotwatch"
npm run verify:phase3
```

ถ้าต้องการ build ตรวจแบบเต็ม:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\phase3-verify.ps1 -RunBuild
```

## สิ่งที่ควรเช็กบนหน้าเว็บ

1. เข้า Settings → Interface Preferences แล้วเปลี่ยน Accent Color
2. สีหลักของปุ่ม, header, stat card, focus ring และ status UI ควรเปลี่ยนตาม
3. เปลี่ยน Interface Density เป็น Compact / Spacious แล้วดูระยะห่างใน Dashboard, Devices, History, Settings
4. เปิด Compact Stat Cards แล้วดูว่า StatCard เตี้ยลงทั่ว Dashboard
5. เปิด Reduce Motion แล้ว animation/pulse ควรลดลง
6. Device Map ควรอยู่ใน card/frame ชั้นเดียว ไม่ซ้อนพื้นหลังหนักเหมือน patch เก่า

## คำสั่งสำคัญ

```powershell
npm run verify:phase3
npm run dashboard:dev
npm run dashboard:build
```

## หมายเหตุ

Phase 3 ยังไม่ลบ CSS patch เก่าทิ้งทันที เพราะอาจกระทบหน้าที่เคยแก้เฉพาะจุดไว้ก่อนหน้า รอบนี้เพิ่ม `phase3-ui-stabilizer.css` เป็น final import layer เพื่อบังคับ UI ที่ควรเป็นมาตรฐานก่อน แล้วค่อยทยอย merge/lift patch เก่าใน Phase 3.1 ได้ปลอดภัยกว่า
