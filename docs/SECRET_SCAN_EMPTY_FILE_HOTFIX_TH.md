# dotWatch Secret Scanner Empty-File Hotfix

แก้ข้อผิดพลาด:

```text
Exception calling "Matches": Value cannot be null
```

## สาเหตุ

`Get-Content -Raw` อาจคืนค่า `$null` เมื่อไฟล์มีขนาด 0 ไบต์ และ
`[regex]::Matches()` ไม่ยอมรับค่า `$null`

## การแก้ไข

- เปลี่ยนเป็น `[System.IO.File]::ReadAllText()`
- ข้ามไฟล์ว่างหรือไฟล์ที่มีเฉพาะ whitespace ก่อนตรวจ regex
- ไม่เปลี่ยนกฎตรวจ secret อื่น

## ตรวจหลังติดตั้ง

```powershell
npm run scan:secrets

powershell -NoProfile -ExecutionPolicy Bypass `
  -File scripts/scan-sensitive-files.ps1 `
  -StagedOnly
```
