dotWatch - History date range and export report patch

Changed files:
- apps/dashboard/src/pages/History.jsx
- apps/dashboard/src/services/api.js
- apps/dashboard/src/styles/history.css
- services/backend/src/controllers/devices.controller.js

Main changes:
1. Prevent Clear Data button overflow in the History filter card.
2. Rename Export CSV to Export and generate a print-ready report containing:
   - Device, metric, start date, end date
   - Records, average, minimum, maximum
   - Trend graph and active alarm thresholds
   - Complete history table
   The browser print dialog opens so the report can be saved as PDF.
3. Add Start Date and End Date filters.
4. Apply the date range to graph, table, statistics, export, and clear data.
5. Split History Table into separate Date and Time columns.
6. Show date + time labels on the graph when the range spans multiple days.

No database migration is required.
Deploy Backend first, then Dashboard.
