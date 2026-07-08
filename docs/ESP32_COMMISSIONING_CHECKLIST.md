# ESP32-DHT3 Commissioning Checklist

ใช้เช็คก่อนส่งมอบ/ติดตั้ง ESP32-DHT3 แต่ละตัว

## 1. Device ใน dotWatch

```text
[ ] สร้าง device ใน Dashboard แล้ว
[ ] Model = ESP32-DHT3
[ ] Device name ถูกต้อง
[ ] Device code จดไว้แล้ว
[ ] Device secret เก็บในที่ปลอดภัย ไม่ใส่ Git
[ ] metric_1 = Temperature
[ ] metric_2 = Humidity
[ ] metric_3 = WiFi RSSI
```

## 2. Hardware

```text
[ ] ESP32 Dev Board เปิดติด
[ ] DHT ต่อสายถูกต้อง
[ ] DHT VCC -> 3V3
[ ] DHT GND -> GND
[ ] DHT DATA -> GPIO4 หรือ pin ที่ตั้งไว้
[ ] ถ้า sensor เปล่า มี pull-up resistor แล้ว
[ ] สาย USB เป็น data cable
```

## 3. Firmware

```text
[ ] Firmware = esp32-dht3-hardening-0.3.0 หรือใหม่กว่า
[ ] Build ผ่าน
[ ] Upload ผ่าน
[ ] Serial Monitor 115200 อ่านได้
[ ] ถ้าไม่มี config เปิด AP dotWatch-ESP32-Setup
```

## 4. Config Portal

```text
[ ] เข้า http://192.168.4.1 ได้
[ ] Wi-Fi SSID ถูกต้อง
[ ] Backend URL = https://dotwatch-backend.onrender.com
[ ] Device Code เป็นของ ESP32 device ตัวนี้
[ ] Device Secret เป็นของ ESP32 device ตัวนี้
[ ] DHT Pin ถูกต้อง
[ ] DHT Type ถูกต้อง
[ ] Send Interval = 20 sec
[ ] Save & Restart แล้ว
```

## 5. Online Test

```text
[ ] Wi-Fi connected
[ ] NTP sync OK หรือ backend ยอมรับ timestamp
[ ] POST status=201 หรือ 200
[ ] SERVER_OK
[ ] Dashboard แสดง Online
[ ] metric_1 มีค่า
[ ] metric_2 มีค่า
[ ] metric_3 มีค่า RSSI
```

## 6. Stability Test 15–30 นาที

```text
[ ] ส่งค่าต่อเนื่องทุก 20 วินาที
[ ] ไม่มี 401
[ ] ไม่มี 429
[ ] ไม่มี restart วนผิดปกติ
[ ] Last Error ใน portal เป็น None หรือไม่มี error ใหม่
[ ] LED status ทำงานตามที่คาด
```

## 7. Reset / Recovery Test

```text
[ ] กด BOOT ค้าง 6 วินาที reset config ได้
[ ] หลัง reset เปิด AP ใหม่ได้
[ ] ตั้งค่าใหม่แล้วส่งข้อมูลได้
[ ] ถอด Wi-Fi ชั่วคราวแล้วกลับมาต่อใหม่ได้
```

## 8. ส่งมอบ

```text
[ ] ติด label Device Code
[ ] บันทึกตำแหน่งติดตั้ง
[ ] บันทึก firmware version
[ ] บันทึกวันติดตั้ง
[ ] ไม่บันทึก secret ในเอกสารสาธารณะ
```
