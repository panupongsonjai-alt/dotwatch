# dotTH ESP32 — Minimal TFT Display

หน้าจอนี้ออกแบบสำหรับ TFT ILI9341 ความละเอียด 320x240 แนวนอน และแสดงผลดังนี้

- แถบสถานะด้านบน: WiFi, Battery และ Online/Linking/Offline
- ค่า Temperature หนึ่งตำแหน่งทศนิยม พร้อมหน่วย °C
- ค่า Humidity หนึ่งตำแหน่งทศนิยม พร้อมหน่วย %RH
- โทนสีดำ ขาว และแดงแบบ minimal
- สถานะ WiFi เปลี่ยนตาม RSSI จริง
- สถานะ Online เปลี่ยนตาม WiFi, Backend และ AppState จริง
- เมื่อเซนเซอร์ไม่มีข้อมูล จะแสดง `--.-`

## ไฟล์ที่ปรับ

- `esp32/dotwatch_esp32_product/src/display/TftDisplay.h`
- `esp32/dotwatch_esp32_product/src/display/TftDisplay.cpp`
- `esp32/dotwatch_esp32_product/include/FirmwareVersion.h`

Firmware version: `esp32-product-1.4.1-minimal-tft`  
Firmware build: `1401`

## Build และ Upload ผ่าน VS Code + PlatformIO

1. เปิดโฟลเดอร์ `D:\IoT Project\dotwatch` ด้วย VS Code
2. ต่อ ESP32 ด้วย USB
3. เปิด PowerShell ใน VS Code
4. รันคำสั่งต่อไปนี้

```powershell
cd "D:\IoT Project\dotwatch\esp32\dotwatch_esp32_product"

pio run -e esp32_product
pio run -e esp32_product -t upload
pio device monitor -b 115200
```

หากคำสั่ง `pio` ไม่พบ ให้ใช้ PlatformIO IDE ใน VS Code:

- PlatformIO: Build
- PlatformIO: Upload
- PlatformIO: Serial Monitor

## ระบุพอร์ต COM เอง

```powershell
cd "D:\IoT Project\dotwatch\esp32\dotwatch_esp32_product"

pio run -e esp32_product -t upload --upload-port COM5
pio device monitor --port COM5 -b 115200
```

เปลี่ยน `COM5` ให้ตรงกับพอร์ตของ ESP32 ใน Device Manager

## TFT Pin Mapping ปัจจุบัน

| TFT | ESP32 |
|---|---:|
| SCK / CLK | GPIO 18 |
| MOSI | GPIO 23 |
| MISO | GPIO 19 |
| CS | GPIO 25 |
| DC | GPIO 27 |
| RST | GPIO 26 |

DHT11 ใช้ GPIO 4 ตามค่าปัจจุบันของโปรเจกต์

## หมายเหตุ Battery

ค่าปัจจุบันของ `POWER_SENSE_PIN` เป็น `-1` ดังนั้นไอคอน Battery จะแสดงสถานะพร้อมใช้งานตลอดเวลา หากต้องการอ่านสถานะแบตเตอรี่จากวงจรจริง ให้กำหนดขา digital power sense ใน `ProductConfig.h` หรือเพิ่มวงจรวัดแรงดันผ่าน ADC ก่อนแสดงเปอร์เซ็นต์แบตเตอรี่
