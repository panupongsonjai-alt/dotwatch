# Phase S3A Validation Report

วันที่ตรวจ: 2026-07-15

## ผลตรวจ

- Phase S1 security verification: PASS — 17 checks
- Phase S2 security/integration tests: PASS
- Phase S3A static security verification: PASS — 11 checks
- ECDSA signing/tamper tests: PASS — 5 cases
- OTA server integration tests: PASS — 4 cases
- Node syntax checks for OTA server/signing tools: PASS

## กรณีที่ทดสอบ

- signature ถูกต้องและ public key ตรงกัน: ยอมรับ
- metadata ถูกแก้หลัง sign: ปฏิเสธ
- key ID ไม่ตรง: ปฏิเสธ
- sign ด้วย key ที่ไม่ trust: ปฏิเสธ
- manifest ถูกแก้ระหว่าง server ทำงาน: fail closed
- current/older build: ไม่เสนอ update
- production server ไม่มี trusted signed manifest: ไม่เริ่มฟัง port

## ข้อจำกัดที่ยังต้องทดสอบบนเครื่องผู้ใช้

- PlatformIO compile ด้วย toolchain จริง
- USB flash ESP32 pilot
- ECDSA verification บนบอร์ดจริง
- OTA download และ reboot/rollback confirmation
- power loss ระหว่าง OTA
- key backup/recovery drill

## คำตัดสิน

Source และ server-side trust chain พร้อมสำหรับ controlled pilot หลังผู้ใช้สร้าง unique signing key, flash trust-chain firmware ผ่าน USB และ sign manifest แล้ว ยังไม่อนุญาต mass rollout หรือเปิด eFuse; Secure Boot/Flash Encryption อยู่ Phase S3B
