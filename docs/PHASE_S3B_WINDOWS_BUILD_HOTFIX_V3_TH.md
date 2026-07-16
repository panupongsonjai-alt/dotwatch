# Phase S3B Windows Secure Build Hotfix v3

## อาการ

Secure build ผ่านขั้น Python 3.11 และติดตั้ง ESP-IDF dependencies แล้ว แต่หยุดที่ CMake:

```text
CONFIGURE_DEPENDS is invalid for script and find package modes.
CMake Error at src/CMakeLists.txt:1
```

อาจมีข้อความประกอบ:

```text
fatal: not a git repository
```

## สาเหตุ

ESP-IDF 4.4.7 โหลด component `CMakeLists.txt` ใน CMake script mode ระหว่างค้นหา requirements แต่ไฟล์เดิมใช้:

```cmake
file(GLOB_RECURSE DOTWATCH_SOURCES CONFIGURE_DEPENDS "*.cpp")
```

`CONFIGURE_DEPENDS` ต้องอาศัย main build-system check target จึงใช้ไม่ได้ใน script mode

Hotfix v3 เปลี่ยนเป็น:

```cmake
file(GLOB_RECURSE DOTWATCH_SOURCES "*.cpp")
```

และเพิ่ม component dependencies ที่ source include โดยตรง

สคริปต์ build ยังเปลี่ยนการสร้าง `subst` drive ให้ map repository root แทน project subfolder เพื่อให้ `.git` ยังมองเห็นได้

## ติดตั้ง

```powershell
$ZipFile = "$env:USERPROFILE\Downloads\dotwatch-phase-s3b-windows-build-hotfix-v3-direct-to-dotwatch.zip"
$RepoRoot = "D:\IoT Project\dotwatch"

Expand-Archive `
  -LiteralPath $ZipFile `
  -DestinationPath $RepoRoot `
  -Force
```

## ตรวจไฟล์

```powershell
Select-String `
  -Path .\esp32\dotwatch_esp32_product\src\CMakeLists.txt `
  -Pattern "CONFIGURE_DEPENDS|bootloader_support|mbedtls"
```

ผลที่ถูกต้อง:

- ไม่พบ `CONFIGURE_DEPENDS`
- พบ `bootloader_support`
- พบ `mbedtls`

## Build ใหม่

```powershell
Set-Location "D:\IoT Project\dotwatch"
subst W: /D 2>$null

$SecureBootKey = "$env:USERPROFILE\.dotwatch\esp32-security\dotwatch-secure-boot-v2-2026-01.secure-boot-v2.pem"

npm run esp32:security:build -- `
  -RepoRoot "D:\IoT Project\dotwatch" `
  -Profile pilot `
  -SecureBootKeyPath $SecureBootKey `
  -Clean
```

ยังห้ามใช้ `-ExecuteIrreversible` จนกว่า build และ signature verification จะผ่าน
