# dotWatch Raspberry Pi Config UI V7.2

ชุดนี้ปรับ UX/UI ของ Raspberry Pi Config UI ให้ไปในทิศทางเดียวกับ dotWatch Dashboard มากขึ้น โดยไม่แตะ logic หลักของ Agent, Backend หรือ Dashboard

## สิ่งที่ปรับ

- เปลี่ยนโทน UI เป็น dashboard dark design system
  - background `#0f172a`
  - panel/card `#1e293b`
  - sidebar `#020617`
  - border `#334155`
  - primary action สี blue `#2563eb`
- ปรับ sidebar ให้คล้าย Dashboard
  - brand card
  - dotWatch red dot logo
  - menu item ทรงเดียวกับ Dashboard
- ปรับ page header ให้เป็น card เหมือนหน้า Dashboard
- ปรับ card, stat card, form, input, select, button, badge ให้เป็น pattern เดียวกัน
- ปรับ live metric card ให้อ่านง่ายขึ้น และเข้ากับ dashboard stat/metric card
- ปรับ responsive สำหรับจอมือถือ/แท็บเล็ต

## ไฟล์ที่แก้

- `pi/config-ui/pi_config_web.py`
- `pi/agent/pi_config_web.py`

สองไฟล์นี้เหมือนกันเพื่อให้ติดตั้งได้ทั้งแบบ config-ui แยก และแบบ bundled ใน agent

## วิธีอัปเดตเฉพาะ UI บน Raspberry Pi

จาก Windows PowerShell ที่โฟลเดอร์โปรเจกต์หลัก:

```powershell
cd "D:\IoT Project\dotwatch"

powershell -ExecutionPolicy Bypass -File ".\pi\scripts\pi-setup-config-ui-render.ps1" `
  -PiHost 192.168.1.237 `
  -PiUser pi
```

ถ้าต้องการติดตั้ง Agent + Config UI ใหม่พร้อมกัน:

```powershell
powershell -ExecutionPolicy Bypass -File ".\pi\scripts\pi-setup-agent-render.ps1" `
  -PiHost 192.168.1.237 `
  -PiUser pi `
  -DeviceCode "DW-ใส่รหัสของคุณ" `
  -DeviceSecret "ใส่_DEVICE_SECRET_ของคุณ" `
  -ApiUrl "https://dotwatch-backend.onrender.com" `
  -SensorSource dummy `
  -SendIntervalSeconds 10 `
  -InstallConfigUi
```

เปิดหน้า UI:

```text
http://<IP_RASPBERRY_PI>:8080
```

Default login ถ้ายังไม่ได้เปลี่ยน:

```text
Username: admin
Password: change-this-config-password
```

## เช็ค service หลังอัปเดต

SSH เข้า Raspberry Pi แล้วรัน:

```bash
sudo systemctl status dotwatch-pi-config-ui
sudo journalctl -u dotwatch-pi-config-ui -f
```
