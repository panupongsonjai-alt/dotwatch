# dotWatch cleanup plan

เป้าหมายคือให้ฝั่ง Raspberry Pi เหลือโฟลเดอร์หลักเดียวคือ `dotwatch-pi` และลบ/ย้ายของเก่าที่ซ้ำกันออกไปแบบปลอดภัย

## เก็บไว้

- `.github`
- `.vscode` แต่ให้เปลี่ยน `tasks.json` เป็นไฟล์ใหม่ในชุดนี้
- `docs`
- `dotwatch-admin`
- `dotwatch-backend`
- `dotwatch-dashboard`
- `dotwatch-firmware`
- `dotwatch-pi`
- `.gitignore`
- `.prettierrc`
- `docker-compose.yml`
- `package.json`
- `package-lock.json`
- `README.md`

## ย้ายเข้า archive / ลบได้หลังทดสอบ

- `dotwatch-pi-agent` — โฟลเดอร์เก่าก่อนรวมเป็น `dotwatch-pi`
- `dotwatch-pi-config-ui-status` — UI เก่า ถูกแทนด้วย `dotwatch-pi/dotwatch_setup_ui.py`
- `dotwatch-realtime-test-tools` — เครื่องมือทดสอบชั่วคราว หลังระบบ ingest ทำงานแล้วไม่จำเป็นใน root
- `scripts` — ชุด script เก่าหลายไฟล์ยังชี้ไป `/home/pi/dotwatch-pi-agent` จึงควรเลิกใช้ แล้วใช้ script ใน `dotwatch-pi/scripts` แทน
- `node_modules` ที่ root — เป็นไฟล์ generated ลบได้ และติดตั้งใหม่ด้วย `npm install` ถ้าต้องใช้

## ยังไม่ฟันธง

- `modbus_data_map_ready.xlsx` — ถ้ายังเป็นไฟล์ source mapping ที่แก้ด้วย Excel อยู่ ให้เก็บไว้ก่อน หรือย้ายไป `docs`/`dotwatch-pi/docs`

## วิธีใช้งาน

1. แตก zip ชุดนี้ไว้ที่ไหนก็ได้
2. Copy ไฟล์ `.vscode/tasks.json` ในชุดนี้ไปทับที่ root project:
   `D:\IoT Project\dotwatch-starter\.vscode\tasks.json`
3. Copy script `scripts/cleanup-dotwatch-root.ps1` ไปไว้ที่ root project หรือรันจาก path ที่แตกไฟล์ก็ได้
4. เปิด PowerShell ที่ root project แล้วรัน Dry run ก่อน:

```powershell
cd "D:\IoT Project\dotwatch-starter"
powershell -ExecutionPolicy Bypass -File ".\scripts\cleanup-dotwatch-root.ps1"
```

5. ถ้ารายการถูกต้อง ให้ย้ายเข้า archive:

```powershell
powershell -ExecutionPolicy Bypass -File ".\scripts\cleanup-dotwatch-root.ps1" -Apply
```

6. ถ้าต้องการลบ `node_modules` ที่ root ด้วย:

```powershell
powershell -ExecutionPolicy Bypass -File ".\scripts\cleanup-dotwatch-root.ps1" -Apply -CleanRootNodeModules
```

7. หลังใช้งานสักพัก ถ้าทุกอย่างปกติ ค่อยลบ `_archive` ด้วยตัวเอง หรือใช้โหมดถาวร:

```powershell
powershell -ExecutionPolicy Bypass -File ".\scripts\cleanup-dotwatch-root.ps1" -Apply -Permanent
```

> แนะนำให้ใช้ `-Apply` ก่อน เพราะจะย้ายเข้า `_archive` ไม่ใช่ลบถาวร
