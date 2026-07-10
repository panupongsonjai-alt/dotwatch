dotWatch Phase 12A - ESP32 Product Core
========================================

วิธีติดตั้ง
-----------
1. แตก ZIP
2. นำโฟลเดอร์ esp32, scripts และ docs ไปวางทับใน:

   D:\IoT Project\dotwatch

3. Firmware เดิมจะไม่ถูกลบหรือแก้ไข
4. Firmware ใหม่อยู่ที่:

   D:\IoT Project\dotwatch\esp32\dotwatch_esp32_product

ตรวจสอบโครงสร้างและ Build
---------------------------
cd "D:\IoT Project\dotwatch"

powershell -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\phase12a-esp32-product-verify.ps1 `
  -RepoRoot "D:\IoT Project\dotwatch"

Build แยก
---------
cd "D:\IoT Project\dotwatch\esp32\dotwatch_esp32_product"
python -m platformio run

Upload
------
python -m platformio run --target upload

Monitor
-------
python -m platformio device monitor --baud 115200

หมายเหตุ
--------
- เป็น Add-only ไม่แทน Firmware เดิม
- ใช้ NVS key เดิม จึงอ่าน Config เดิมได้
- Wi-Fi ใหม่ใช้ Pending + Rollback ก่อนบันทึกเป็น Active
- ยังไม่รวม OTA, Activation Code และ Secure Boot
