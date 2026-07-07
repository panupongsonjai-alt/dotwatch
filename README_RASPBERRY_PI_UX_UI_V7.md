# dotWatch Raspberry Pi UX/UI V7

ชุดนี้เพิ่มหน้า Web UI สำหรับ Raspberry Pi Gateway ให้ใช้งานง่ายขึ้น โดยยังใช้ Python standard library เท่านั้น ไม่ต้องติดตั้ง Flask/FastAPI

## สิ่งที่เพิ่มใน V7

- หน้า Setup Center สำหรับใส่ Backend URL, Device Code, Device Secret, Sensor Source และ UI Password
- หน้า Live สำหรับตั้งค่า Modbus TCP/RTU, mapping 20 metrics และอ่านค่าแบบต่อเนื่อง
- หน้า Status สำหรับดูสถานะ service, IP, disk, memory, load, temperature และ logs ล่าสุด
- หน้า Diagnostics สำหรับทดสอบ Backend health, Modbus read once, USB/RS485 scan และติดตั้ง Python dependency
- แก้ PowerShell script ให้ไม่พังจาก `$Remote:$RemoteDir`
- เพิ่ม script ติดตั้ง Config UI โดยตรง: `pi-setup-config-ui-render.ps1`

## วิธีติดตั้งแบบเร็ว

จาก Windows PowerShell ที่โฟลเดอร์โปรเจกต์หลัก:

```powershell
cd "D:\IoT Project\dotwatch"

.\pi\scripts\pi-setup-agent-render.ps1 `
  -PiHost 192.168.1.237 `
  -PiUser pi `
  -DeviceCode "DW-ใส่รหัสของคุณ" `
  -DeviceSecret "ใส่_DEVICE_SECRET_ของคุณ" `
  -ApiUrl "https://dotwatch-backend.onrender.com" `
  -SensorSource dummy `
  -SendIntervalSeconds 10 `
  -InstallConfigUi
```

หลังติดตั้ง เปิด:

```text
http://<PI_IP>:8080
```

Default login:

```text
Username: admin
Password: change-this-config-password
```

แนะนำให้เข้าไปเปลี่ยน UI Password ทันทีที่หน้า Setup

## ถ้าติดตั้ง Agent ไปแล้ว ต้องการอัปเดตเฉพาะ UI

```powershell
.\pi\scripts\pi-setup-config-ui-render.ps1 `
  -PiHost 192.168.1.237 `
  -PiUser pi
```

## Flow ที่แนะนำ

1. สร้าง Device รุ่น DW20CH ใน Dashboard
2. Copy Device Code + Device Secret
3. Upload agent ด้วย `SENSOR_SOURCE=dummy`
4. เปิด `http://<PI_IP>:8080`
5. หน้า Setup: ตรวจ checklist ให้ครบ
6. หน้า Status: ดูว่า Agent active หรือไม่
7. หน้า Live: ตั้งค่า Modbus แล้วกด Read Once / Start
8. ถ้าอ่านค่าได้แล้ว ค่อยเปลี่ยน Sensor Source เป็น `modbus`
9. กด Save & Restart Agent

## ไฟล์สำคัญบน Pi

```text
/home/pi/dotwatch-pi-agent/.env
/home/pi/dotwatch-pi-agent/modbus_config.json
/home/pi/dotwatch-pi-agent/pi_config_web.py
```

## Service

```bash
sudo systemctl status dotwatch-pi-agent
sudo systemctl status dotwatch-pi-config-ui
sudo journalctl -u dotwatch-pi-agent -f
sudo journalctl -u dotwatch-pi-config-ui -f
```
