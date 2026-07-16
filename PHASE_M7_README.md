# dotWatch Mobile Phase M7 — Android Release Readiness

## เพิ่มใน Phase นี้

- Backend `/health/live` monitoring
- Banner เมื่อเชื่อมต่อ Backend ไม่ได้
- Global React Error Boundary
- Public environment validation utility
- Release structure checker
- ตรวจ dependencies ที่จำเป็น
- ตรวจ `app.json`
- ตรวจ EAS production profile
- เพิ่ม Expo Notifications plugin
- เพิ่มคำสั่ง `npm run check:release`

## ติดตั้ง

```powershell
$PatchZip = "$env:USERPROFILE\Downloads\dotwatch-mobile-phase-m7-release-readiness.zip"
$PatchDir = "$env:USERPROFILE\Downloads\dotwatch-mobile-phase-m7-release-readiness"
$RepoRoot = "D:\IoT Project\dotwatch"

Remove-Item -LiteralPath $PatchDir -Recurse -Force -ErrorAction SilentlyContinue
Expand-Archive -LiteralPath $PatchZip -DestinationPath $PatchDir -Force
Copy-Item -Path "$PatchDir\*" -Destination $RepoRoot -Recurse -Force

powershell -NoProfile -ExecutionPolicy Bypass `
  -File "$RepoRoot\scripts\install-mobile-phase-m7.ps1" `
  -RepoRoot $RepoRoot
```

## ตรวจสอบ

```powershell
npm --prefix apps/mobile run typecheck
npm --prefix apps/mobile run check:release
```

## Build

```powershell
Set-Location "D:\IoT Project\dotwatch\apps\mobile"

eas build --platform android --profile development
eas build --platform android --profile preview
eas build --platform android --profile production
```
