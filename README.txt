dotWatch - Alarm Tables History Style
Date: 2026-07-12

Changed files:
- apps/dashboard/src/pages/Alarms.jsx
- apps/dashboard/src/styles/pages/alarms.css

Changes:
1. Alarm Events and Alarm Rules now use the same table surface classes as History Table.
2. Removed the legacy device-v2-table class from both alarm tables.
3. Added visible Action headers for acknowledge/delete controls.
4. Applied fixed/equal-width columns and centered headers/cells.
5. Centered device, metric, condition, value, status, date, and action content.
6. Matched History Table border, radius, header surface, row dividers, and hover behavior.
7. Preserved horizontal scrolling on smaller screens.
8. No backend, API, or database changes.

Verification:
- Dashboard Vite production build: PASSED
- 2701 modules transformed
