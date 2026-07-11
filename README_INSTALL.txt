dotWatch Metrics & Alarms complete fix

Changed files:
- apps/dashboard/src/components/MetricConfigPanel.jsx
- apps/dashboard/src/pages/Devices.jsx
- apps/dashboard/src/styles/devices.css
- services/backend/src/routes/alarmRules.routes.js
- services/backend/migrations/run.js

Main changes:
1. Removed the outer frame around Metric Name / Unit / Icon / Display.
2. Made alarm create, update, pause and delete-by-clearing-threshold work through one Save All action.
3. Backend now returns the canonical saved rules so the UI can edit them again immediately.
4. Added legacy alarm_rules created_at/updated_at migration safeguards.
5. Improved success/error feedback and reduced visual noise.

Install by extracting this archive over the dotwatch repository root.
Deploy backend before dashboard. Backend Pre-Deploy Command must run: npm run migrate
