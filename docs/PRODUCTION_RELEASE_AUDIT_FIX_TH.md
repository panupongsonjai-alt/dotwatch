# Production Release Audit Fix

แก้ false positives ที่พบจาก audit รอบ `20260716-155556`

## รายการที่แก้

1. **Admin build**
   - Vite build สำเร็จและคืน exit code 0
   - ข้อความ `PLUGIN_TIMINGS` ถูกเขียนออก stderr และ Windows PowerShell
     แปลงเป็น `NativeCommandError`
   - Audit runner จะเก็บ stderr เป็น log แต่ตัดสินผลจาก exit code จริง

2. **Phase 3 secret hygiene**
   - ไฟล์ `.env` แบบ local สามารถมีอยู่ได้เมื่อ Git ignore อย่างถูกต้อง
   - ยังบล็อกทันทีเมื่อไฟล์ถูก track หรือเป็นไฟล์ untracked ที่ไม่ถูก ignore
   - ไม่อ่านหรือพิมพ์ค่าภายในไฟล์

3. **Phase 11G font parity**
   - CSS จริงใช้ `"Prompt"`
   - verifier เดิมตรวจเฉพาะ `'Prompt'`
   - verifier ใหม่รองรับทั้ง single quote และ double quote

4. **Git working tree**
   - ยังคงเป็น strict release gate
   - ต้อง commit patch นี้ก่อนรัน full audit ซ้ำ

## ตรวจเฉพาะจุด

```powershell
npm run check:admin
npm run verify:phase3
npm run verify:phase11g:admin-dashboard-parity
npm run scan:secrets
```

## Full audit

หลัง commit และ working tree สะอาด:

```powershell
powershell `
  -NoProfile `
  -ExecutionPolicy Bypass `
  -File ".\scripts\production-release-audit.ps1"
```

ผลที่คาดหวัง:

```text
Total : 32
Passed: 32
Failed: 0
```
