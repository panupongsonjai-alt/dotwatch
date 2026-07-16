# dotTH ESP32 — TFT White Screen Fix 1.4.2

## อาการ

จอ 2.4 นิ้ว ILI9341 มีไฟ Backlight แต่พื้นที่แสดงผลเป็นสีขาวทั้งหมด

## การแก้ไขในโค้ด

1. ลด SPI TFT จาก 40 MHz เป็น 10 MHz
2. ตั้งขา CS/DC/RST เป็น OUTPUT และกำหนด Idle State ก่อนเริ่ม SPI
3. ทำ Hard Reset ที่ GPIO 26 โดยดึง LOW 30 ms และรอ Controller 180 ms
4. ทดสอบจอด้วยสีแดงสั้น ๆ ก่อนเข้าสู่ LVGL
5. สั่ง LVGL วาดเฟรมแรกทันทีระหว่าง Boot
6. อัปเดต Firmware เป็น `esp32-product-1.4.2-tft-white-screen-fix` Build `1402`

## ไฟล์ที่แก้

- `esp32/dotwatch_esp32_product/include/ProductConfig.h`
- `esp32/dotwatch_esp32_product/include/FirmwareVersion.h`
- `esp32/dotwatch_esp32_product/src/display/TftDisplay.cpp`
- `README_ESP32_MINIMAL_TFT_TH.md`

## Upload

```powershell
cd "D:\IoT Project\dotwatch\esp32\dotwatch_esp32_product"

py -m platformio run -e esp32_product
py -m platformio run -e esp32_product -t upload --upload-port COM5
py -m platformio device monitor --port COM5 --baud 115200
```

เปลี่ยน `COM5` ให้ตรงกับ ESP32 ของเครื่อง

## ผลที่ควรเห็น

- จอกะพริบสีแดงประมาณ 0.12 วินาที
- จอเปลี่ยนเป็น Dashboard พื้นหลังดำ
- Serial Monitor แสดงบรรทัดเริ่มต้นด้วย `TftDisplay: init ILI9341`
- Serial Monitor แสดง `boot self-test complete`

หากไม่มีสีแดงกะพริบและยังขาวตลอด แสดงว่าสัญญาณยังไม่ถึง Controller ให้ตรวจสายตามนี้:

| TFT ILI9341 | ESP32 |
|---|---:|
| VCC | 3V3 |
| GND | GND |
| SCK / CLK | GPIO 18 |
| MOSI / SDA / DIN | GPIO 23 |
| MISO / SDO / DO | GPIO 19 |
| CS | GPIO 25 |
| DC / RS / A0 | GPIO 27 |
| RST / RESET | GPIO 26 |
| LED / BL | 3V3 |
