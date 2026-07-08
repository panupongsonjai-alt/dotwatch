# dotWatch Phase 4K — Production Release Checklist

Phase 4K ใช้สรุป baseline ที่พร้อมใช้งานจริง หลังจากเพิ่ม ESP32-DHT3, Local Admin Portal และ Dashboard ESP32 detail แล้ว

## เป้าหมาย

```text
1. ตรวจไฟล์สำคัญของ production baseline
2. ตรวจ backend health
3. ตรวจ database model list
4. build dashboard/admin ตามที่เลือก
5. build ESP32 Local Admin firmware ตามที่เลือก
6. สร้าง baseline report ลง _reports/release-baseline/
7. commit เอกสาร release checklist ได้แบบปลอดภัย
8. สร้าง git tag เพื่อ lock baseline ได้เมื่อพร้อม
```

## ไฟล์ในแพ็ก

```text
README_PHASE4K_PRODUCTION_RELEASE.md
PRODUCTION_RELEASE_CHECKLIST.md
RELEASE_NOTES_PHASE4_ESP32.md
BASELINE_LOCK_TEMPLATE.md
dotwatch-phase4k-production-release-check.ps1
```

## ติดตั้งไฟล์เข้า repo

แตก zip ลงที่:

```text
D:\IoT Project\dotwatch
```

แล้วรัน:

```powershell
cd "D:\IoT Project\dotwatch"

powershell -NoProfile -ExecutionPolicy Bypass -File .\dotwatch-phase4k-production-release-check.ps1 `
  -RepoRoot "D:\IoT Project\dotwatch" `
  -InstallFiles
```

## ตรวจแบบเต็มก่อน lock baseline

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\dotwatch-phase4k-production-release-check.ps1 `
  -RepoRoot "D:\IoT Project\dotwatch" `
  -BackendUrl "https://dotwatch-backend.onrender.com" `
  -DashboardUrl "https://dotwatch.onrender.com" `
  -RunBackendChecks `
  -BuildDashboard `
  -BuildAdmin `
  -BuildEsp32LocalAdmin `
  -CreateBaselineReport
```

## Commit เอกสาร release

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\dotwatch-phase4k-production-release-check.ps1 `
  -RepoRoot "D:\IoT Project\dotwatch" `
  -InstallFiles `
  -CommitDocs `
  -Push
```

## สร้าง Git tag เพื่อล็อก baseline

ทำหลังจาก build/check ผ่านและ commit เรียบร้อยแล้ว:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\dotwatch-phase4k-production-release-check.ps1 `
  -RepoRoot "D:\IoT Project\dotwatch" `
  -CreateGitTag `
  -TagName "phase4k-production-20260708" `
  -PushTag
```

## หมายเหตุ

- Script ไม่เขียน device secret ลง report
- Script ไม่ stage `_cleanup_trash`, `_reports`, `.env`, secret หรือ deleted files
- Baseline report เป็น generated artifact จึงไม่ควร commit
- Commit เฉพาะเอกสาร release/checklist เท่านั้น
