# Phase 3: Dashboard UX Stabilization

## เป้าหมาย

ทำให้ Dashboard มี UI direction เดียวกันมากขึ้น โดยแก้เฉพาะส่วนที่เสี่ยงต่ำ:

- รวม logic ของ Interface Preferences ไปไว้ที่ utility กลาง
- เพิ่ม CSS final stabilization layer สำหรับ card/header/stat/map/button/focus
- เพิ่ม Density option แบบ `Spacious`
- เพิ่ม script audit เพื่อกันลืม import หรือแก้ preferences กระจัดกระจายอีก

## ไฟล์ที่เพิ่ม

```text
apps/dashboard/src/utils/uiPreferences.js
apps/dashboard/src/styles/phase3-ui-stabilizer.css
scripts/dashboard-style-audit.mjs
scripts/phase3-verify.ps1
README_PHASE3_START_HERE.md
docs/PHASE_3_DASHBOARD_UX_STABILIZATION.md
docs/DASHBOARD_DESIGN_SYSTEM_NOTES.md
```

## ไฟล์ที่แก้

```text
apps/dashboard/src/App.jsx
apps/dashboard/src/pages/Settings.jsx
apps/dashboard/src/utils/clientSecurity.js
apps/dashboard/src/styles.css
package.json
README.md
```

## รายละเอียดการแก้

### 1. Shared UI Preferences Utility

เพิ่ม `apps/dashboard/src/utils/uiPreferences.js` เพื่อเป็น source of truth ของ:

- Accent options
- Density options
- Default preferences
- การอ่าน/เขียน localStorage
- การ apply `data-accent`, `data-density`, `data-reduce-motion`, `data-compact-cards`
- event `dotwatchUiSettingsChanged`

ก่อนหน้านี้ App และ Settings มี logic คล้ายกันคนละชุด ทำให้แก้ทีหลังแล้วเสี่ยงไม่ตรงกัน

### 2. Settings ใช้ utility กลาง

`Settings.jsx` ถูกปรับให้ import options/functions จาก `uiPreferences.js` แทนการประกาศซ้ำในไฟล์เดียว

ผลลัพธ์:

- ลด duplicate constants
- เพิ่ม Density: `Spacious`
- Save settings ยังบันทึก dashboard display toggles เหมือนเดิม
- Preview UI preferences ยังเปลี่ยนให้เห็นทันทีเหมือนเดิม

### 3. App ใช้ utility กลาง

`App.jsx` ใช้ `applyUiPreferences()` และ `UI_PREFERENCE_EVENT` จาก utility กลาง ทำให้ทั้ง app ใช้ event และ data attributes ชุดเดียวกัน

### 4. Client security ใช้ option กลาง

`clientSecurity.js` ใช้ `ACCENT_OPTIONS` และ `DENSITY_OPTIONS` จาก utility กลางตอน sanitize preference values เพื่อลดโอกาส allowed values ไม่ตรงกับ Settings

### 5. CSS final stabilization layer

เพิ่ม `apps/dashboard/src/styles/phase3-ui-stabilizer.css` และ import เป็นไฟล์สุดท้ายใน `styles.css`

ไฟล์นี้ไม่ลบ CSS เก่า แต่เป็น final layer สำหรับ:

- Page headers
- Cards
- Stat cards
- Buttons
- Focus ring
- Settings active state
- Device Map frame
- Command palette / workspace help
- Compact / Spacious density
- Compact stat cards
- Mobile header/action layout

## ทำไมยังไม่ลบ CSS patch เก่า

Dashboard ตอนนี้มีหลายไฟล์ที่เป็น patch/fix/unify จากการแก้เฉพาะจุดก่อนหน้า ถ้าลบทันทีมีโอกาสทำให้หน้าที่เคยแก้ไว้กลับมาพัง Phase 3 จึงใช้แนวทางปลอดภัยกว่า:

1. เพิ่ม utility กลาง
2. เพิ่ม final CSS layer
3. เพิ่ม audit script
4. ค่อยทยอย merge patch เก่าใน Phase 3.1

## Verify

```powershell
npm run verify:phase3
```

หรือ build ด้วย:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\phase3-verify.ps1 -RunBuild
```
