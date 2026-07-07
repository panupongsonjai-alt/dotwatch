# dotWatch UI / Performance Patch V5

ชุดนี้ต่อจาก v4 Render fix โดยไม่แก้ backend logic หลักที่รันได้แล้ว โฟกัสเฉพาะ Dashboard/Admin UI และการโหลดหน้าแรก

## Files changed

- `apps/dashboard/src/pages/Dashboard.jsx`
  - Defer loading Device Map chunk after first paint to make Dashboard show KPI/data faster.
- `apps/dashboard/src/pages/Devices.jsx`
  - Replace blocking browser alerts with inline notice for most actions.
  - Add retry/error state for device loading.
  - Add safe reset-secret result panel so the new secret can be copied without browser alert.
- `apps/dashboard/src/components/devices/DeviceList.jsx`
  - Add memoized device list item.
  - Add loading skeleton.
  - Add latest metric preview chips on each device row.
  - Add retry button when device load fails.
- `apps/dashboard/src/components/devices/CreateDeviceWizard.jsx`
  - Hide Device Secret until creation is completed.
  - Add Copy Code + Secret button on finish screen.
- `apps/dashboard/src/styles/devices.css`
  - Add styles for notice, skeleton, metric chips, secret warning, reset-secret result panel.
- `apps/dashboard/src/styles/dashboard.css`
  - Add deferred map placeholder style.
- `apps/dashboard/vite.config.js`
  - Split heavy dependencies into separate cacheable chunks: Firebase, charts, maps, icons.
- `apps/admin/vite.config.js`
  - Split Firebase and icon chunks for Admin.

## Tested

Commands run in container:

```bash
npm --prefix apps/dashboard run build
npm --prefix apps/admin run build
node --check services/backend/src/server.js
```

Dashboard/Admin production build completed successfully.

## Deploy

After replacing files:

```bash
git add .
git commit -m "Improve dashboard UI and frontend performance"
git push
```

Then redeploy on Render:

- Dashboard: Manual Deploy -> Clear build cache & deploy
- Admin: Manual Deploy -> Clear build cache & deploy

Backend redeploy is not required for this patch unless your Render setup auto-deploys the whole repo.
