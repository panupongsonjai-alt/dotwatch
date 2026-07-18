# dotTH ESP8266 OLED 0.96

โปรเจกต์ทดสอบสำหรับ:

- NodeMCU ESP8266
- OLED 0.96 นิ้ว SSD1306 แบบ I2C ความละเอียด 128x64
- DHT11
- แสดง Temperature และ Humidity บนหน้าจอ
- ตรวจจับ I2C address 0x3C และ 0x3D อัตโนมัติ

## โครงสร้างไฟล์

```text
dotwatch-esp8266-oled-096/
├─ include/
│  └─ AppConfig.h
├─ src/
│  └─ main.cpp
├─ platformio.ini
├─ WIRING_TH.md
└─ README_TH.md
```

## Build

เปิด PowerShell ในโฟลเดอร์โปรเจกต์แล้วรัน:

```powershell
py -m platformio run -e esp8266_oled
```

## Upload

```powershell
py -m platformio run -e esp8266_oled --target upload
```

หากอัปโหลดไม่พบพอร์ต ให้ตรวจสอบพอร์ตก่อน:

```powershell
py -m platformio device list
```

ระบุพอร์ตเอง ตัวอย่าง COM5:

```powershell
py -m platformio run -e esp8266_oled --target upload --upload-port COM5
```

## Serial Monitor

```powershell
py -m platformio device monitor -b 115200
```

หรือระบุพอร์ต:

```powershell
py -m platformio device monitor -p COM5 -b 115200
```

## ผลลัพธ์บนหน้าจอ

```text
dotTH                         ONLINE
------------------------------------
TEMP                     HUM
28.5 C                   65.0%
------------------------------------
Updated 15s
```

## กรณีหน้าจอไม่แสดงผล

1. ตรวจว่าจอเป็น SSD1306 I2C แบบ 4 ขา
2. ตรวจ VCC ต่อกับ 3V3
3. ตรวจ GND ต่อกราวด์ร่วม
4. ตรวจ SCL ต่อ D1 / GPIO5
5. ตรวจ SDA ต่อ D2 / GPIO4
6. เปิด Serial Monitor เพื่อดูว่าตรวจพบ address 0x3C หรือ 0x3D หรือไม่

## การเปลี่ยนขาและค่าตั้งต้น

แก้ไขไฟล์ `include/AppConfig.h`

ค่าหลัก:

```cpp
constexpr uint8_t OLED_SDA_PIN = D2;
constexpr uint8_t OLED_SCL_PIN = D1;
constexpr uint8_t DHT_PIN = D5;
```
