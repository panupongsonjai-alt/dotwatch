# Phase 10C — Dashboard Device UX Alignment

Phase 10C improves the Devices page so ESP32 / gateway devices are easier to operate after field rollout.

## Scope

- Keep existing backend/API behavior unchanged.
- Keep the existing dashboard theme and design tokens.
- Improve only dashboard-side Devices UX/readability.
- Add an easy live snapshot for selected devices.
- Make ESP32-DHT3 readings easier to understand: temperature, humidity, RSSI/signal, last seen, firmware.

## Files changed

- `apps/dashboard/src/components/devices/DeviceList.jsx`
- `apps/dashboard/src/components/devices/SelectedDevicePanel.jsx`
- `apps/dashboard/src/pages/Devices.jsx`
- `apps/dashboard/src/styles/phase10c-device-ux.css`
- `apps/dashboard/src/styles.css`
- `scripts/phase10c-device-ux-verify.mjs`

## Test

```powershell
npm run verify:phase10c:device-ux
npm run dashboard:build
```

## Manual UI check

1. Open the dashboard Devices page.
2. Select the ESP32-DHT3 device that is sending data.
3. Confirm that the selected panel shows a Live Device Snapshot.
4. Confirm temperature, humidity, RSSI, last seen, firmware, and ESP32 admin PIN hint are readable.
5. Confirm the page remains usable on mobile width.
