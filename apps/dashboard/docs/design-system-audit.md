# dotWatch Design System Audit

## สรุปผลตรวจ

โดยรวมโปรเจกต์เริ่มมี Design System แล้ว โดยมี component/style กลาง เช่น:

- `PageHeader`
- `SectionHeader`
- `StatCard`
- `StatusBadge`
- `EmptyState`
- `dw-page-header`
- `dw-stat-card`
- `dw-status-badge`

แต่ยังมีบางหน้าที่ยังใช้ pattern เดิมหรือ custom class เฉพาะหน้า ทำให้ layout/color/theme ดูไม่เหมือนกัน 100%

## จุดที่พบ

### 1. Header แต่ละหน้า

ผ่าน:
- Dashboard ใช้ `PageHeader`
- Devices ใช้ `PageHeader`
- History ใช้ `PageHeader`
- Profile ใช้ `PageHeader`
- Settings ใช้ `PageHeader`

ควรแก้:
- Alarms ยังใช้ `app-page-header` แบบ custom

ใน patch นี้แก้ให้ Alarms ใช้ `PageHeader` แล้ว

### 2. Section Header

ผ่าน:
- Profile / Settings ใช้ `SectionHeader`

ควรแก้:
- Dashboard ใช้ `app-section-title`
- History ใช้ `history-section-title`
- Alarms ใช้ `app-section-title`

ใน patch นี้แก้ Alarms ให้ใช้ `SectionHeader` แล้ว และเพิ่ม CSS ให้ `app-section-title` / `history-section-title` มีหน้าตาตรงกับ `SectionHeader`

### 3. Stat Card

ผ่าน:
- Dashboard / Devices / Profile / Settings / Alarms ใช้ `StatCard`

ควรแก้:
- History มี `HistoryStatCard` custom

ใน patch นี้แก้ `HistoryStatCard` ให้เรียกใช้ `StatCard` กลางแล้ว

### 4. ปุ่มและสถานะ

พบ class หลายชุด:
- `primary-button`
- `ghost-button`
- `secondary-button`
- `save-btn`
- `delete-btn`
- `history-export-btn`
- `security-action`
- `status`
- `history-device-status`
- `dw-status-badge`

ใน patch นี้เพิ่ม CSS กลางเพื่อให้ขนาด, radius, border, สี และ spacing ไปทางเดียวกัน

### 5. Card / Table / Empty State

พบหลายหน้าใช้ pattern คล้ายกันแต่ class คนละชุด:
- `app-card`
- `history-chart-card`
- `history-table-card`
- `app-empty-state`
- `history-empty-box`

ใน patch นี้เพิ่ม CSS กลางให้ card/table/empty-state มี surface, border, radius, shadow, spacing สอดคล้องกัน

### 6. Color Theme

จุดดี:
- ส่วนใหญ่ใช้ token เช่น `var(--panel)`, `var(--panel-2)`, `var(--text)`, `var(--muted)`, `var(--primary)`, `var(--success)`, `var(--warning)`, `var(--danger)`

จุดที่ควรระวัง:
- Dashboard live metric card มี hard-coded dark gradient ค่อนข้างเด่นกว่าหน้าอื่น
- History chart ใช้สี hard-coded หลายจุด ซึ่งยังใช้ได้ แต่ถ้าต้องการ theme เต็ม 100% ควรย้ายเป็น token ในอนาคต

ใน patch นี้ปรับ live metric card ให้ tone ใกล้ `dw-metric-card` มากขึ้น

## ไฟล์ที่แก้ใน patch นี้

```text
dotwatch-dashboard/src/styles.css
dotwatch-dashboard/src/styles/design-layout-unify.css
dotwatch-dashboard/src/pages/Alarms.jsx
dotwatch-dashboard/src/pages/History.jsx
```

## วิธีติดตั้ง

1. แตก ZIP
2. คัดลอกไฟล์ใน `dotwatch-dashboard` ไปทับในโปรเจกต์จริง
3. รัน frontend

```powershell
cd "D:\IoT Project\dotwatch-starter\dotwatch-dashboard"
npm run dev
```

## หน้าที่ควรเช็คหลังวางไฟล์

- Dashboard
- Devices
- History
- Alarms
- Profile
- Settings
- Light theme
- Dark theme
- Mobile width ประมาณ 390px / 560px / 900px
