# dotWatch Final Design Consistency Audit

## ขอบเขตที่ตรวจ

ตรวจจากไฟล์ล่าสุดในงานนี้และชุด patch ล่าสุดที่เราแก้กัน ได้แก่:

```text
Dashboard
Devices
Device Detail
History
Alarms
Profile
Settings
Login/Auth
Sidebar/Navbar
```

## สรุปภาพรวม

ตอนนี้ Design System ของ dotWatch อยู่ในทิศทางเดียวกันมากขึ้นแล้ว โดยโครงหลักที่ควรยึดเป็นมาตรฐานคือ:

```text
PageHeader       = หัวหน้าทุกหน้า
SectionHeader    = หัวข้อใน card/section
StatCard         = card ตัวเลข/สถานะ
app-card/panel   = surface หลักของแต่ละ section
status/badge     = chip / badge / count
table/form       = ใช้ radius, border, background เดียวกัน
```

## จุดที่ผ่านแล้ว

### Dashboard

ผ่านหลัง patch ล่าสุด:

- Data Overview
- Devices Overview
- Device Map
- Live Alarm State

ทั้ง 4 section ใช้ card surface, radius, spacing, title, description และ badge pattern ใกล้กันแล้ว

### Device Detail

ผ่านหลัง patch ล่าสุด:

- Overview / Metrics / Timeline ใช้โครง card เดียวกัน
- History Analytics ถูกลบออกจาก Overview tab
- Firmware font ถูกลดลง
- Timeline header กลับมาขนาดเดียวกับ Overview
- รายละเอียดใน timeline item เล็กลงและไม่กระทบ SectionHeader

### History

ผ่าน:

- ใช้ PageHeader
- Stat cards ใช้ pattern เดียวกับหน้าอื่น
- ช่องว่างใต้ header ถูกลดให้ใกล้ Dashboard / Devices

### Alarms

ควรอยู่ในแนวเดียวกันถ้าใช้ patch `design_system_unify` ก่อนหน้า:

- ใช้ PageHeader
- ใช้ SectionHeader
- Stat card / table ถูก normalize ด้วย CSS final guard

### Profile / Settings

ส่วนใหญ่ผ่านแล้วเพราะใช้ card/panel + header pattern เดียวกัน และ final guard ช่วย normalize:

- card radius
- section header
- form control
- button
- stat grid

### Login/Auth

ควรแยก layout ได้ แต่ควรใช้ token เดียวกัน:

- background
- primary color
- border
- input radius
- button radius

final guard ไม่ได้เปลี่ยน auth layout หนักเกินไป เพื่อไม่ให้หน้า login เสีย

## จุดที่ยังควรระวัง

1. CSS มีหลายไฟล์และหลาย patch ซ้อนกัน
   - แนะนำให้เก็บไฟล์ final guard import ไว้ท้ายสุดเสมอ

2. ถ้าแก้ `styles.css` ในอนาคต
   - อย่าลบ import ด้านท้าย เช่น:
     ```css
     @import './styles/design-consistency-final.css';
     ```

3. ถ้าเพิ่มหน้าใหม่
   - ให้ใช้ `PageHeader`, `SectionHeader`, `StatCard`, `app-card/panel` เป็น pattern หลัก

4. ถ้า section ใหม่ใน Dashboard
   - ให้ใช้ class:
     ```text
     dashboard-unified-section
     dashboard-unified-section-header
     dashboard-unified-section-badge
     ```

5. ถ้า tab ใหม่ใน Device Detail
   - ให้ใช้ class:
     ```text
     device-detail-tab-panel
     device-detail-unified-card
     ```

## ไฟล์ที่ให้ใน patch นี้

```text
dotwatch-dashboard/src/styles.css
dotwatch-dashboard/src/styles/design-consistency-final.css

dotwatch-dashboard/src/pages/Dashboard.jsx
dotwatch-dashboard/src/components/DeviceMap.jsx
dotwatch-dashboard/src/styles/pages/dashboard.css

dotwatch-dashboard/src/pages/DeviceDetail.jsx
dotwatch-dashboard/src/components/device-detail/DeviceOverviewTab.jsx
dotwatch-dashboard/src/components/device-detail/DeviceMetricsTab.jsx
dotwatch-dashboard/src/components/device-detail/DeviceTimelineTab.jsx

dotwatch-dashboard/src/styles/design-layout-unify.css
dotwatch-dashboard/src/styles/history-stat-spacing-fix.css
dotwatch-dashboard/src/styles/device-detail-stat-row-fix.css
dotwatch-dashboard/src/styles/device-detail-final-cleanup.css
dotwatch-dashboard/src/styles/device-detail-timeline-font-fix.css
dotwatch-dashboard/src/styles/device-detail-tabs-unify.css
dotwatch-dashboard/src/styles/device-detail-timeline-header-fix.css

dotwatch-dashboard/docs/final-design-consistency-audit.md
```

## วิธีตรวจหลังวางไฟล์

เปิดหน้าต่อไปนี้แล้วเทียบ pattern:

```text
Dashboard
Devices
Device Detail > Overview
Device Detail > Metrics
Device Detail > Timeline
History
Alarms
Profile
Settings
Login
```

ควรดูว่า:

```text
1. Header ทุกหน้าไปทางเดียวกัน
2. Section card radius/padding เท่ากัน
3. หัวข้อและรายละเอียด section ขนาดเท่ากัน
4. Badge/Count chip เหมือนกัน
5. Stat card ขนาดและ typography เหมือนกัน
6. Form/table/empty state ไม่หลุด theme
7. Dark/Light theme ไม่สีหลุด
8. Mobile ยังจัด column ถูกต้อง
```
