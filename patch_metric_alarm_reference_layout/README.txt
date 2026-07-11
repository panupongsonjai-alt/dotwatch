dotWatch Metrics & Alarms Reference Layout Patch

Changed files:
- apps/dashboard/src/components/MetricConfigPanel.jsx
- apps/dashboard/src/styles/devices.css

What changed:
- Removed the No. column and metric numbering from the desktop table.
- Metric Name spans the Severity + Condition area, matching the reference screenshot.
- Unit aligns with Alarm Threshold.
- Icon aligns with Alarm notification message.
- Display aligns with Alarm Active.
- Warning and Critical rows use the same shared physical grid columns.
- Delete Metric is a compact icon button at the far-right action column.
- Responsive layouts remain available for tablet and mobile.
- Save All Settings behavior remains unchanged and still saves both Metrics and Alarms.

Install in PowerShell:
$Repo = "D:\IoT Project\dotwatch"
$Patch = "$env:USERPROFILE\Downloads\dotwatch-metrics-alarms-reference-layout-patch.zip"
Expand-Archive -Path $Patch -DestinationPath $Repo -Force
Set-Location $Repo
npm run check:dashboard
