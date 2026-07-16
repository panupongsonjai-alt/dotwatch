# Validation — ESP32 TFT White Screen Fix 1.4.2

## ผลการตรวจ

- ตรวจโครงสร้างและ syntax ของ `TftDisplay.cpp`: **PASS**
- ตรวจค่าขา ILI9341: SCK 18, MOSI 23, MISO 19, CS 25, DC 27, RST 26
- ตรวจ Firmware version: `esp32-product-1.4.2-tft-white-screen-fix`
- ตรวจ Firmware build: `1402`
- ไม่มีโฟลเดอร์ `.pio` หรือไฟล์ build ชั่วคราวในแพ็กส่งมอบ

## หมายเหตุการ Build

ได้เริ่มตรวจ Full PlatformIO Build แล้ว แต่ environment ที่ใช้ตรวจไม่สามารถดาวน์โหลดแพ็กเกจ `espressif32@7.0.1` ให้เสร็จภายในเวลาของระบบ จึงยืนยันได้ในระดับ source/syntax แต่ยังไม่ได้ยืนยัน binary จาก environment นี้

ให้ Build บนเครื่อง Windows ด้วยคำสั่ง:

```powershell
cd "D:\IoT Project\dotwatch\esp32\dotwatch_esp32_product"
py -m platformio run -e esp32_product
```
