# dotTH ESP8266 Temperature and Humidity Product

Firmware ชุดนี้ดัดแปลงจากโครงสร้าง ESP32 ของ dotTH ให้ทำงานบน ESP8266 โดยคงแนวทาง Web App แบบเดียวกับ Dashboard และส่งค่าเพียง 2 Metrics:

- `metric_1` = Temperature
- `metric_2` = Humidity
- `rssi` = ข้อมูลสถานะ Wi-Fi ไม่ใช่ Dashboard Metric

โฟลเดอร์พร้อมใช้งาน:

```text
esp8266/dotwatch_esp8266_product
```

## บอร์ดที่รองรับ

PlatformIO มี Environment สำเร็จให้ 2 แบบ:

```text
nodemcuv2   NodeMCU ESP8266
 d1_mini    Wemos D1 mini
```

ค่าเริ่มต้นคือ `nodemcuv2`

## Hardware Default

| อุปกรณ์ | GPIO | ชื่อบน NodeMCU/D1 mini |
|---|---:|---|
| DHT Data | GPIO4 | D2 |
| Status LED | GPIO2 | D4 / Built-in LED |
| Factory Reset Button | GPIO0 | FLASH |

การต่อ DHT11/DHT22:

```text
DHT VCC  -> 3.3V
DHT DATA -> D2 / GPIO4
DHT GND  -> GND
```

ถ้าเป็น Sensor แบบไม่มี Module ให้ใส่ตัวต้านทาน Pull-up 4.7k–10k ระหว่าง DATA และ 3.3V

## จุดที่ปรับจาก ESP32

- เปลี่ยน PlatformIO จาก `espressif32` เป็น `espressif8266`
- รองรับ NodeMCU v2 และ Wemos D1 mini
- เปลี่ยน Wi-Fi, HTTP, TLS และ Web Server API เป็นของ ESP8266
- ใช้ BearSSL สำหรับ HTTPS Root CA
- ใช้ LittleFS แทน ESP32 Preferences/NVS
- แยก CSS และ JavaScript เป็น `/portal.css` และ `/portal.js` เพื่อลดการใช้ RAM
- ปรับ Built-in LED เป็น Active LOW
- ใช้ FLASH button GPIO0 กดค้าง 6 วินาทีเพื่อ Factory Reset
- คง Web App แบบ Modular แยก Components, Pages, Features และ Styles
- คง Local Admin PIN เริ่มต้นเป็น `admin`

## Build

NodeMCU ESP8266:

```powershell
cd "D:\IoT Project\dotwatch\esp8266\dotwatch_esp8266_product"
py -m platformio run -e nodemcuv2
```

Wemos D1 mini:

```powershell
py -m platformio run -e d1_mini
```

## Upload

NodeMCU ESP8266:

```powershell
py -m platformio run -e nodemcuv2 -t upload
```

ระบุ COM Port:

```powershell
py -m platformio run -e nodemcuv2 -t upload --upload-port COM5
```

Wemos D1 mini:

```powershell
py -m platformio run -e d1_mini -t upload
```

## Serial Monitor

```powershell
py -m platformio device monitor --baud 115200
```

## Setup Portal

เมื่อยังไม่มี Wi-Fi หรือเชื่อมต่อไม่สำเร็จ ESP8266 จะเปิด Access Point:

```text
SSID     : dotTH-8266-Setup-XXXXXX
Password : dotth-setup
URL      : http://192.168.4.1/
```

`XXXXXX` คือ 6 ตัวท้ายของ MAC Address

## Local Admin

หลังเชื่อม Wi-Fi สำเร็จ ให้เปิด Local IP ที่แสดงใน Serial Monitor

```text
PIN เริ่มต้น: admin
```

สามารถเปลี่ยน PIN ได้จากหน้า Security

## Web App Structure

```text
portal-preview/src/
├─ app/
├─ components/
├─ pages/
├─ features/
├─ shared/
└─ styles/
```

HTML ฝั่ง Firmware แยกอยู่ที่:

```text
src/portal/views/
├─ PortalView.cpp
├─ CommonPages.cpp
├─ OverviewPage.cpp
├─ WifiPage.cpp
├─ DevicePage.cpp
├─ SensorPage.cpp
├─ SecurityPage.cpp
└─ SystemPage.cpp
```

หลังแก้ Web App ให้ Sync เข้า Firmware:

```powershell
cd portal-preview
npm run check
```

## Configuration Storage

ESP8266 ใช้ LittleFS และสร้างไฟล์ภายใน Flash:

```text
/dotth-config.json
/dotth-wifi.json
```

Factory Reset จะลบทั้งสองไฟล์

## Model Identity

```text
Product Name     : dotTH ESP8266 Product
Model Key        : esp8266_dht2
Model Name       : ESP8266-DHT2
Firmware Version : esp8266-product-1.0.0
```

การส่งข้อมูลใช้ Device Code และ Device Secret จาก dotWatch Backend เช่นเดียวกับ ESP32

## Dashboard Metric Mapping

ตั้งค่า Device ใน Dashboard ให้มี 2 Metrics:

```text
metric_1 = Temperature  หน่วย °C
metric_2 = Humidity     หน่วย %
```

`rssi` ถูกส่งเป็นข้อมูลการเชื่อมต่อและไม่ต้องเพิ่มเป็น Metric ที่สาม
