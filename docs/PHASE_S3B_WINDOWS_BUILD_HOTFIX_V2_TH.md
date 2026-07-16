# Phase S3B Windows Secure Build Hotfix v2

## สาเหตุ

ฟังก์ชัน `Invoke-PythonTool` ของ hotfix รุ่นแรกปล่อย stdout ของ PlatformIO กลับผ่าน PowerShell success pipeline พร้อม exit code เมื่อ caller เขียน:

```powershell
$exitCode = Invoke-PythonTool ...
```

ตัวแปร `$exitCode` จึงเป็น array ที่ประกอบด้วยข้อความ output และเลข exit code แม้ PlatformIO clean จบด้วย `0` เงื่อนไข `$exitCode -ne 0` ก็ยังถูกตีความว่าเป็นจริงได้ และแสดง `PlatformIO clean failed` โดยไม่แสดง output ที่ถูก capture ไว้

## การแก้ไข

- ส่ง stdout ของ PlatformIO ไปยังหน้าจอด้วย `Out-Host`
- คืนค่าเฉพาะ integer exit code
- แสดง exit code จริงใน error message
- ไม่แตะบอร์ด ไม่ upload firmware และไม่เปลี่ยน eFuse

## ติดตั้ง

แตก ZIP ลง `D:\IoT Project\dotwatch` โดยตรง แล้วตรวจ:

```powershell
Select-String `
  -Path .\scripts\esp32-security-build.ps1 `
  -Pattern "Out-Host|nativeExitCode|exit code"
```

## รันใหม่

```powershell
Set-Location "D:\IoT Project\dotwatch"

$SecureBootKey = "$env:USERPROFILE\.dotwatch\esp32-security\dotwatch-secure-boot-v2-2026-01.secure-boot-v2.pem"

npm run esp32:security:build -- `
  -RepoRoot "D:\IoT Project\dotwatch" `
  -Profile pilot `
  -SecureBootKeyPath $SecureBootKey `
  -Clean
```

หาก PlatformIO ล้มจริง จะเห็น output เต็มและ error เช่น:

```text
PlatformIO clean failed (exit code 1)
```

หาก clean ผ่าน สคริปต์จะเดินต่อไป build firmware โดยอัตโนมัติ
