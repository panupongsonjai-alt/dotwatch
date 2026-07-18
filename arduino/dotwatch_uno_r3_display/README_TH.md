# dotTH Arduino UNO R3 OLED Display

โปรเจกต์นี้ใช้ Arduino UNO R3 อ่านค่า DHT11 และแสดงผลบนจอ OLED 0.96 นิ้ว SSD1306 ความละเอียด 128x64 ผ่าน I2C

โปรเจกต์นี้เป็นแบบออฟไลน์ ไม่มี Wi-Fi, Backend, Portal หรือ OTA

## อุปกรณ์

- Arduino UNO R3
- OLED 0.96 นิ้ว SSD1306 I2C 128x64
- DHT11 แบบโมดูล 3 ขา หรือเซนเซอร์เปล่าพร้อมตัวต้านทาน pull-up
- สาย USB สำหรับ UNO R3
- สาย Jumper

## ตำแหน่งโปรเจกต์ที่แนะนำ

```text
D:\IoT Project\dotwatch\arduino\dotwatch_uno_r3_display
```

## Build

```powershell
cd "D:\IoT Project\dotwatch\arduino\dotwatch_uno_r3_display"
py -m platformio run -e uno_r3_display
```

## ตรวจพอร์ต

```powershell
py -m platformio device list
```

## Upload

เปลี่ยน `COM6` ให้ตรงกับพอร์ตจริงของ Arduino UNO R3

```powershell
py -m platformio run -e uno_r3_display `
  --target upload `
  --upload-port COM6
```

## Serial Monitor

```powershell
py -m platformio device monitor `
  --port COM6 `
  --baud 115200
```

## การทำงาน

- ตรวจหา OLED address `0x3C` และ `0x3D` อัตโนมัติ
- อ่าน DHT11 ทุก 2.5 วินาที
- แสดงอุณหภูมิและความชื้นแบบทศนิยมหนึ่งตำแหน่ง
- แสดง `ONLINE` เมื่ออ่านเซนเซอร์สำเร็จ
- แสดง `ERROR` เมื่ออ่าน DHT11 ไม่สำเร็จ
- ใช้ U8g2 แบบ page buffer เพื่อลดการใช้ SRAM บน UNO R3

## กรณี OLED ไม่แสดง

ตรวจการต่อสาย:

- OLED SDA ไป A4
- OLED SCL ไป A5
- OLED GND ไป GND
- OLED VCC ให้ตรงกับแรงดันที่โมดูลรองรับ

เปิด Serial Monitor แล้วดูข้อความ:

```text
DisplayManager: OLED initialized at 0x3C
```

หรือ:

```text
DisplayManager: OLED not found at 0x3C or 0x3D
```

## กรณี DHT11 แสดง ERROR

ตรวจ:

- DATA ไป D2
- VCC และ GND ไม่สลับ
- หากเป็น DHT11 แบบตัวเปล่า ให้เพิ่มตัวต้านทาน 4.7k-10k ระหว่าง DATA กับ VCC

## หน้าจอเวอร์ชัน 1.1.0

ปรับหน้าจอเป็น dashboard แบบ minimal:

- Header `dotTH` พร้อมสถานะ `LIVE` หรือ `ERR`
- การ์ด Temperature และ Humidity แยกชัดเจน
- ไอคอน Thermometer และ Humidity แบบวาดด้วยกราฟิก
- ตัวเลขขนาดใหญ่ อ่านง่ายขึ้น
- Footer แสดงสถานะ DHT11 และช่วงเวลาอัปเดต
- Startup screen แบบกรอบโค้ง
- ยังคงใช้ U8g2 page buffer เพื่อประหยัด SRAM ของ UNO R3
