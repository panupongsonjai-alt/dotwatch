# dotWatch Pi Config UI

หน้า Web Config สำหรับ Raspberry Pi Agent ของ dotWatch

## สิ่งที่ทำได้

- ตั้งค่า Backend API URL
- ตั้งค่า Device Code / Device Secret
- ตั้งค่า Send Interval
- ตั้งค่า Firmware Version
- ตั้งค่า username/password ของหน้า Config
- ดูสถานะ service `dotwatch-pi-agent`
- ดู log ล่าสุด
- Test ingest เข้า backend
- Restart agent หลัง save config

## Install

บน Raspberry Pi:

```bash
cd ~/dotwatch-pi-agent
```

คัดลอกไฟล์ `pi_config_web.py` และ `install_config_ui_service.sh` มาไว้ในโฟลเดอร์นี้

จากนั้นรัน:

```bash
chmod +x install_config_ui_service.sh
./install_config_ui_service.sh
```

## Open

```text
http://<PI-IP>:8080
```

ตัวอย่าง:

```text
http://192.168.1.28:8080
```

Default login:

```text
Username: admin
Password: change-this-config-password
```

หลังเข้าได้แล้วให้เปลี่ยน password ทันที

## Useful commands

Config UI:

```bash
sudo systemctl status dotwatch-pi-config-ui
sudo systemctl restart dotwatch-pi-config-ui
journalctl -u dotwatch-pi-config-ui -f
```

Agent หลัก:

```bash
sudo systemctl status dotwatch-pi-agent
sudo systemctl restart dotwatch-pi-agent
journalctl -u dotwatch-pi-agent -f
```

## หมายเหตุเรื่องปุ่ม Restart Agent

ถ้าปุ่ม Restart Agent ในหน้าเว็บใช้ไม่ได้ ให้ restart ด้วย terminal แทน:

```bash
sudo systemctl restart dotwatch-pi-agent
```

สาเหตุคือ systemd ต้องการสิทธิ์ sudo ซึ่งปลอดภัยกว่าการเปิดสิทธิ์ให้เว็บโดยอัตโนมัติ
