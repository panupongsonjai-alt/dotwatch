# Phase S3B Software Closeout

วันที่: 2026-07-16

## ขอบเขต

ปิดงาน Phase S3B ฝั่งซอฟต์แวร์โดยยังไม่ทำ provisioning บอร์ด เนื่องจากบอร์ดปัจจุบันเป็น ESP32 revision 1.0 ซึ่งไม่รองรับ Secure Boot v2 ตาม policy ของโครงการ

## สิ่งที่แก้

1. Windows secure build ใช้ Python 3.11 และ map repository ด้วย `subst` เมื่อ path มีช่องว่าง
2. ตัด `CONFIGURE_DEPENDS` ที่ ESP-IDF 4.4.7 ไม่รองรับใน component script mode
3. ตัด dependency ชื่อ `arduino` ที่ไม่มีอยู่จริงใน ESP-IDF component graph
4. ตรวจและติดตั้ง Python package `ecdsa`/`cryptography` ก่อน PlatformIO signing
5. ตรวจไฟล์ signed ที่ถูกต้อง ไม่ตรวจ `firmware.bin` ซึ่งเป็น unsigned intermediate
6. Verify RSA Secure Boot v2 signature ของ:
   - `firmware-signed.bin`
   - `bootloader-signed.bin`
   - `partitions-signed.bin`
7. ใช้ขนาด `firmware-signed.bin` เป็น OTA slot gate
8. รายงาน SHA-256 ของ signed images โดยไม่บันทึก private-key path

## ผลที่ยืนยันแล้วบนเครื่องโครงการ

- `firmware-signed.bin` ขนาด 1,445,888 bytes
- OTA slot ขนาด 1,507,328 bytes
- พื้นที่คงเหลือ 61,440 bytes
- SHA-256 application signed image:
  `BFD048EA6F15E66AFF6F80FE0F3031F4EEA9FF9CDCF8E8684E235347F59A085B`
- RSA signature block 0 ตรวจผ่านด้วย Secure Boot key ที่กำหนด
- บอร์ด COM6: ESP32 revision 1.0, Secure Boot=False, Flash Encryption=False, FLASH_CRYPT_CNT=0
- ไม่มี eFuse หรือ flash state ถูกเปลี่ยน

## คำสั่ง Software Closeout

```powershell
Set-Location "D:\IoT Project\dotwatch"

$SecureBootKey = "$env:USERPROFILE\.dotwatch\esp32-security\dotwatch-secure-boot-v2-2026-01.secure-boot-v2.pem"

npm run test:phase-s3:software

npm run esp32:security:build -- `
  -RepoRoot "D:\IoT Project\dotwatch" `
  -Profile pilot `
  -SecureBootKeyPath $SecureBootKey
```

ผลสุดท้ายที่ต้องได้:

```text
PASS: secure firmware build and signature verification completed
Hardware changed : False
```

## Deferred Hardware Gate

งานต่อไปนี้พักไว้จนกว่าจะมี ESP32 revision 3.0+:

- full-flash/eFuse backup ของบอร์ด pilot
- plan-only provisioning
- first encrypted boot
- post-boot eFuse verification
- power-cycle/rollback test
- release-profile manufacturing approval

ห้ามใช้ `-ExecuteIrreversible` กับบอร์ด revision 1.0
