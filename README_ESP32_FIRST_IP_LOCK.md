# dotTH ESP32 — First IP Lock

ชุดนี้ปรับ ESP32 ให้จำ IP ที่ได้รับจาก DHCP ในการเชื่อมต่อ Wi-Fi สำเร็จครั้งแรกของแต่ละ SSID แล้วนำ IP, Gateway, Subnet และ DNS ชุดเดิมกลับมาใช้เป็น Static IP ในการเชื่อมต่อครั้งถัดไป

## พฤติกรรม

1. การเชื่อมต่อครั้งแรกของ SSID ใช้ DHCP
2. เมื่อเชื่อมต่อสำเร็จ ESP32 บันทึก IP/Gateway/Subnet/DNS ลง NVS
3. หลัง Restart ครั้งถัดไป ESP32 ใช้ IP ที่บันทึกไว้เป็น Fixed IP
4. หาก Fixed IP เชื่อมต่อไม่ได้ ระบบลอง DHCP Recovery เพื่อให้อุปกรณ์ยังกลับมาออนไลน์ได้
5. DHCP Recovery จะไม่เขียนทับ Fixed IP เดิม
6. เมื่อต้องการเปลี่ยน IP ให้เปิดหน้า Wi-Fi แล้วกด `เรียนรู้ Fixed IP ใหม่`
7. การเปลี่ยนไป SSID ใหม่จะเรียนรู้ IP แรกของ SSID ใหม่นั้นแยกจาก SSID เดิม
8. การกด `ล้างเฉพาะ Wi-Fi` จะล้างทั้ง Wi-Fi profiles และ Fixed IP ที่จำไว้

## Version

- Firmware: `esp32-product-1.1.1-fixed-ip`
- Build: `1110`
- Config schema: `3`

## ไฟล์สำคัญที่แก้

- `include/AppTypes.h`
- `include/FirmwareVersion.h`
- `include/ProductConfig.h`
- `src/config/ConfigStore.h`
- `src/config/ConfigStore.cpp`
- `src/network/WiFiManager.h`
- `src/network/WiFiManager.cpp`
- `src/portal/PortalServer.h`
- `src/portal/PortalServer.cpp`
- `src/portal/views/WifiPage.cpp`
- `portal-preview/src/pages/WifiPage.html`
- `portal-preview/src/features/status/status.js`
- `portal-preview/src/preview/preview.js`
- `portal-preview/src/mocks/mock-device.js`
- `portal-preview/src/styles/05-pages.css`
- `src/portal/PortalAssets.h` (generated)

## ติดตั้ง

แตก ZIP ที่โฟลเดอร์หลักของ dotWatch และยืนยันการแทนที่โฟลเดอร์:

```text
esp32\dotwatch_esp32_product
```

จากนั้น Build:

```powershell
cd "D:\IoT Project\dotwatch\esp32\dotwatch_esp32_product"
py -m platformio run -t clean
py -m platformio run
```

Upload ผ่าน USB ครั้งนี้:

```powershell
py -m platformio run -t upload --upload-port COM6
```

เปลี่ยน `COM6` ให้ตรงกับเครื่อง

## ทดสอบ

### Restart ครั้งที่ 1

Firmware จะเชื่อมต่อด้วย DHCP และ Serial จะแสดงประมาณ:

```text
WiFiManager: remembered first IP 192.168.1.212 for SSID howtolongStudio
WiFiManager: this IP will be static after the next restart
```

### Restart ครั้งที่ 2

Serial ควรแสดง:

```text
WiFiManager: applying remembered first IP 192.168.1.212 for howtolongStudio
WiFiManager: connected with fixed first IP 192.168.1.212
```

หน้า Wi-Fi จะแสดง:

```text
IP Mode         Fixed from first connection
Locked First IP 192.168.1.212
```

## เรียนรู้ IP ใหม่

เปิด ESP32 Web App:

```text
http://IP-ปัจจุบัน/
```

ไปที่:

```text
Wi-Fi → เรียนรู้ Fixed IP ใหม่
```

ยืนยันการทำรายการ ระบบจะ Restart แล้วใช้ DHCP หนึ่งครั้งเพื่อเรียนรู้ IP ใหม่

## หมายเหตุสำคัญ

การใช้ Static IP ที่เคยได้รับจาก DHCP อาจมีความเสี่ยง IP ชน หาก Router นำ IP เดิมไปแจกให้อุปกรณ์อื่นหลัง DHCP lease หมดอายุ การตั้ง DHCP Reservation ที่ Router ยังคงเป็นวิธีที่ปลอดภัยที่สุดสำหรับระบบ Production
