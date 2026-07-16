# dotWatch Mobile Phase M7 Fixes

แก้ 3 ปัญหา:

1. `getReactNativePersistence` ไม่ถูก export จาก type entry ของ `firebase/auth`
2. `package.json` และ `app.json` มี UTF-8 BOM จาก Windows PowerShell
3. ไม่มีคำสั่ง global `eas`

## ติดตั้ง

```powershell
$PatchZip = "$env:USERPROFILE\Downloads\dotwatch-mobile-phase-m7-fixes.zip"
$PatchDir = "$env:USERPROFILE\Downloads\dotwatch-mobile-phase-m7-fixes"
$RepoRoot = "D:\IoT Project\dotwatch"

Remove-Item -LiteralPath $PatchDir -Recurse -Force -ErrorAction SilentlyContinue
Expand-Archive -LiteralPath $PatchZip -DestinationPath $PatchDir -Force
Copy-Item -Path "$PatchDir\*" -Destination $RepoRoot -Recurse -Force

powershell -NoProfile -ExecutionPolicy Bypass `
  -File "$RepoRoot\scripts\fix-mobile-phase-m7.ps1" `
  -RepoRoot $RepoRoot
```

## EAS

ใช้ EAS CLI แบบ local:

```powershell
Set-Location "D:\IoT Project\dotwatch\apps\mobile"

npx eas-cli login
npx eas-cli init
npx eas-cli build:configure
```

ไม่ต้องติดตั้ง EAS CLI แบบ global
