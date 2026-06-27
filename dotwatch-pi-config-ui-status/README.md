# dotWatch Pi Config UI with Raspberry Pi Status Page

เวอร์ชันนี้เพิ่มหน้า `/status` สำหรับดูสถานะ Raspberry Pi โดยอิงดีไซน์ dotWatch

## เพิ่มอะไรใหม่

หน้า `Raspberry Pi Status` แสดง:

- Hostname
- Local Time
- Uptime
- CPU Temperature
- Memory Usage
- Disk Usage
- Agent Service Status
- Config UI Service Status
- Load Average
- Python Version
- Platform
- Wi-Fi / Network / Route
- Raspberry Pi throttle, voltage, CPU clock ถ้าเครื่องรองรับ `vcgencmd`

## วิธีอัปเดตผ่าน VS Code

เอาไฟล์ `pi_config_web.py` ไปแทนของเดิมใน:

```bash
/home/pi/dotwatch-pi-agent/pi_config_web.py
```

จากนั้นรัน:

```bash
cd ~/dotwatch-pi-agent
sudo systemctl restart dotwatch-pi-config-ui
```

เปิดหน้าเว็บ:

```text
http://<PI-IP>:8080
```

หน้า Status:

```text
http://<PI-IP>:8080/status
```

## ถ้ายังไม่ได้ติดตั้ง service

```bash
cd ~/dotwatch-pi-agent
chmod +x install_config_ui_service.sh
./install_config_ui_service.sh
```

## Useful commands

```bash
sudo systemctl status dotwatch-pi-config-ui
sudo systemctl restart dotwatch-pi-config-ui
journalctl -u dotwatch-pi-config-ui -f
```
