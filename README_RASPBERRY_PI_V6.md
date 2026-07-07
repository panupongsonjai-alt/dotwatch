# dotWatch Raspberry Pi Agent V6

ชุดนี้ใช้สำหรับเริ่ม Raspberry Pi หลังจาก Dashboard, Backend, Admin และ Render ใช้งานได้แล้ว

## สิ่งที่แก้ใน V6

- แก้ agent ให้ส่ง `metrics` เป็น object ถูกต้องเสมอ
- รองรับ Modbus reader ที่คืนค่าแบบ `(metrics, errors)` โดยไม่ทำให้ `/api/ingest` พัง
- เพิ่ม timestamp ตอนส่งค่าเข้า backend
- เพิ่ม `install_agent_service.sh` สำหรับติดตั้งเป็น systemd service
- เพิ่ม profile `generic_20_tcp.json` สำหรับอ่าน 20 ค่าแบบ Modbus TCP
- แก้ `.env.example` ให้เริ่มจาก `dummy` ก่อน เพื่อทดสอบ flow ให้ผ่านก่อนต่อ Modbus จริง

## Flow ที่แนะนำ

1. สร้าง Device ใน Dashboard และ copy `Device Code` + `Device Secret`
2. Upload agent ไป Raspberry Pi
3. Run dummy mode ให้ Dashboard เห็น device online ก่อน
4. ค่อยเปลี่ยนเป็น Modbus TCP/RTU
5. เมื่อนิ่งแล้วค่อยติดตั้งเป็น service ให้รันอัตโนมัติ

## Upload จาก Windows แบบเร็ว

เปิด PowerShell ที่โฟลเดอร์หลักของโปรเจกต์ แล้วรัน:

```powershell
.\pi\scripts\pi-setup-agent-render.ps1 `
  -PiHost 192.168.1.237 `
  -PiUser pi `
  -DeviceCode "DW-ใส่รหัสของคุณ" `
  -DeviceSecret "ใส่_SECRET_ของคุณ" `
  -ApiUrl "https://dotwatch-backend.onrender.com" `
  -SensorSource dummy `
  -SendIntervalSeconds 10
```

จากนั้น SSH เข้า Pi แล้วทดสอบ manual:

```bash
ssh pi@192.168.1.237
cd /home/pi/dotwatch-pi-agent
source venv/bin/activate
python main.py
```

ถ้าสำเร็จจะเห็น log ส่งค่า และ Dashboard จะเห็น device online

## ติดตั้งให้รันอัตโนมัติ

หลัง manual test ผ่าน:

```bash
cd /home/pi/dotwatch-pi-agent
chmod +x install_agent_service.sh
./install_agent_service.sh
sudo systemctl status dotwatch-pi-agent
sudo journalctl -u dotwatch-pi-agent -f
```

## เปลี่ยนเป็น Modbus TCP

```bash
cd /home/pi/dotwatch-pi-agent
cp modbus_profiles/generic_20_tcp.json modbus_config.json
nano modbus_config.json
```

แก้ IP ของ Modbus TCP gateway/device:

```json
"tcp": {
  "host": "192.168.1.50",
  "port": 502,
  "timeout": 3
}
```

แก้ `.env`:

```bash
nano .env
```

เปลี่ยน:

```env
SENSOR_SOURCE=modbus
```

ทดสอบ manual ก่อน:

```bash
source venv/bin/activate
python main.py
```

ถ้าผ่านแล้ว restart service:

```bash
sudo systemctl restart dotwatch-pi-agent
sudo journalctl -u dotwatch-pi-agent -f
```

## คำสั่งเช็คสถานะ

```bash
sudo systemctl status dotwatch-pi-agent
sudo journalctl -u dotwatch-pi-agent -n 100 --no-pager
sudo journalctl -u dotwatch-pi-agent -f
```

## ถ้าเจอ Error ที่พบบ่อย

`HTTP 401 Invalid device secret` = Device Secret ไม่ตรง ให้สร้าง device ใหม่หรือ reset secret

`HTTP 429 Device is sending too fast` = ส่งถี่เกินไป ให้เพิ่ม `SEND_INTERVAL_SECONDS` มากกว่าค่า backend เช่น 10 วินาที

`Cannot connect to Modbus device` = IP/port/unit id หรือ network ไป Modbus TCP ไม่ถึง

`No valid metrics returned from sensor` = mapping register ผิด หรือ data_type/scale ผิด
