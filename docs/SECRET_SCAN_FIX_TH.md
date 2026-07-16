# dotWatch Secret Scan Fix

แก้ปัญหา scanner ตรวจไฟล์ที่ Git ignore แล้วและ false positive จาก binary/test fixture

## พฤติกรรมใหม่

- ค่าเริ่มต้นตรวจ tracked files และ untracked files ที่ Git ไม่ ignore
- `-StagedOnly` ตรวจเฉพาะไฟล์ที่ stage
- `-IncludeIgnored` ใช้ตรวจ working tree แบบเข้มงวด
- ข้าม firmware `.bin`, `.elf`, object และ library binary
- ไม่บล็อก DATABASE_URL ตัวอย่างหรือ localhost
- test fixture ต้องมี marker `TEST-ONLY` หรือ `not-for-production`
- regex ของ `DEVICE_SECRET` ไม่ข้ามบรรทัดอีก

## ติดตั้ง

แตก ZIP ที่ root ของ repository แล้วแทนที่:

`scripts/scan-sensitive-files.ps1`

## ตรวจ

```powershell
npm run scan:secrets

powershell -NoProfile -ExecutionPolicy Bypass `
  -File scripts/scan-sensitive-files.ps1 `
  -StagedOnly
```

## Full local audit

คำสั่งนี้อาจพบ `.env` และรายงาน local ที่มี credential ตามวัตถุประสงค์:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File scripts/scan-sensitive-files.ps1 `
  -IncludeIgnored
```
