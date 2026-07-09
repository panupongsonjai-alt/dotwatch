# dotWatch Phase 10A — ESP32 Remembered Wi-Fi Auto Connect

Phase 10A ปรับ firmware หลักของ ESP32 production candidate:

```text
esp32/dotwatch_esp32_dht3_tls_hardened
```

เป้าหมายคือให้ ESP32 จำ Wi-Fi ที่เคยบันทึก/ต่อสำเร็จแล้ว และเมื่อเปิดเครื่องใหม่หรือ Wi-Fi กลับมาอีกครั้ง ให้สแกนหาเครือข่ายที่จำไว้แล้วต่ออัตโนมัติ

## สิ่งที่เปลี่ยน

- เพิ่ม remembered Wi-Fi profiles เก็บใน ESP32 Preferences/NVS key `wifiProfiles`
- จำได้สูงสุด 5 เครือข่าย
- เมื่อ save Wi-Fi จาก portal จะบันทึกเข้า remembered profiles ทันที
- เมื่อเชื่อมต่อสำเร็จ จะ persist SSID/password ล่าสุดกลับเป็น primary profile
- ตอน reconnect จะสแกนเครือข่ายที่เจอ และเลือก remembered SSID ที่ RSSI แรงที่สุดก่อน
- ถ้าสแกนไม่เจอหรือเป็น hidden SSID จะยัง fallback ไปลอง primary SSID เดิม
- เปิด `WiFi.setAutoReconnect(true)` และ `WiFi.setSleep(false)` เพื่อให้เชื่อมต่อกลับเสถียรขึ้น
- JSON status เพิ่ม `wifiSsid` และ `rememberedWifiProfiles`
- หน้า portal แสดงรายการ remembered Wi-Fi แบบ masked เฉพาะ SSID ไม่แสดง password

## พฤติกรรมที่คาดหวัง

1. ตั้งค่า Wi-Fi บ้านผ่าน setup portal
2. ESP32 ต่อ Wi-Fi บ้านสำเร็จและส่งข้อมูลได้
3. ย้าย ESP32 ไป Wi-Fi อีกที่ เช่น office แล้วแก้ Wi-Fi ผ่าน Local Admin
4. ESP32 จะจำทั้งบ้านและ office
5. เมื่อกลับมาเจอ Wi-Fi บ้านอีกครั้ง ESP32 จะ auto reconnect โดยไม่ต้อง reset config

## ข้อจำกัดด้านความปลอดภัย

ESP32 firmware เดิมเก็บ Wi-Fi password ใน Preferences อยู่แล้ว Phase นี้เพิ่ม list ของ remembered profiles ใน Preferences เช่นกัน ดังนั้นถ้าต้องการล้างข้อมูลทั้งหมดให้ใช้ Factory Reset Config หรือกด BOOT ค้างตาม policy เดิม

## คำสั่งตรวจ

```powershell
cd "D:\IoT Project\dotwatch"
npm run verify:phase10a:esp32-wifi
```

## Build / Upload

```powershell
cd "D:\IoT Project\dotwatch\esp32\dotwatch_esp32_dht3_tls_hardened"
pio run
pio run -t upload
pio device monitor
```

หรือใช้ helper เดิม:

```powershell
cd "D:\IoT Project\dotwatch"
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\esp32-field-check.ps1 -Build -Upload -Monitor
```

## Serial log ที่ควรเห็น

```text
Scanning Wi-Fi for remembered networks...
Connecting remembered Wi-Fi: <SSID> RSSI=-55
Wi-Fi connected. SSID=<SSID> IP=...
Remembered Wi-Fi profiles=2
```
