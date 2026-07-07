# Dashboard Design System Notes

## Current direction

Dashboard ควรใช้ pattern เหล่านี้เป็นหลัก:

- Page container: `.page` หรือ `.app-page`
- Page header: `PageHeader` / `.dw-page-header`
- Section header: `SectionHeader` / `.dw-section-header`
- Card: `.app-card` หรือ component card เฉพาะหน้า แต่ให้รับ token เดียวกัน
- Stat: `StatCard` / `.dw-stat-card`
- Status: `StatusBadge` / `.dw-status-badge`
- Buttons: `.primary-button`, `.secondary-button`, `.ghost-button`, `.danger-button`

## UI preference data attributes

Applied on `document.documentElement`:

```text
data-accent="blue|sky|cyan|teal|emerald|lime|amber|orange|red|rose|pink|violet|indigo"
data-density="comfortable|compact|spacious"
data-reduce-motion="true|false"
data-compact-cards="true|false"
```

## Files to edit first for future UI changes

1. `apps/dashboard/src/utils/uiPreferences.js`
2. `apps/dashboard/src/styles/phase3-ui-stabilizer.css`
3. `apps/dashboard/src/styles/design-system.css`
4. Specific page CSS only when a page needs truly unique layout

## Files to avoid expanding further

ถ้าเป็นไปได้ ไม่ควรเพิ่ม patch ใหม่ต่อท้ายหลายไฟล์ในรูปแบบ:

- `*-fix.css`
- `*-unify.css`
- `*-final.css`
- `*-guard.css`
- `*-stabilizer.css`

ให้รวมเข้าชั้นกลางแทน เพื่อลด CSS conflict ระยะยาว

## Phase 3.1 recommended cleanup

- ตรวจว่า selector จาก `statcard-*.css` ตัวไหนยังจำเป็น
- ย้าย selector ที่จำเป็นเข้า `design-system.css` หรือ `phase3-ui-stabilizer.css`
- ลบ import ที่ไม่ใช้ทีละไฟล์พร้อมเช็ก build
- ทำ screenshot/manual checklist หน้า Dashboard, Devices, Device Detail, History, Settings
