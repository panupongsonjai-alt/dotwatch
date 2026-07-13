# คู่มือติดตั้ง ใช้งาน และนำ dotWatch ขึ้น GitHub

เอกสารนี้ใช้กับแพ็กเกจ `dotwatch-clean-fixed` ที่ตรวจและ cleanup วันที่
13 กรกฎาคม 2026 ภายใน ZIP มีโฟลเดอร์ `dotwatch/` ซึ่งเป็น source พร้อมใช้งาน
โดยไม่รวม `.git`, `node_modules`, `dist`, cache, `.env` จริง และข้อมูลลับ

## 1. สิ่งที่แก้ไขแล้ว

### มาตรฐานการยืนยันรายการสำคัญ

- การลบ Device, Metric, Alarm Rule, History, Alarm Events และ Notification
  ต้องพิมพ์คำว่า `Delete` ตรงตัวก่อนปุ่มยืนยันจะทำงาน
- การลบ/ปิดใช้งาน Device Model ใน Admin ใช้มาตรฐาน `Delete` เดียวกัน
- หน้า Portal ของ ESP32 และ ESP8266 ใช้ `Delete` สำหรับการล้าง Wi-Fi และ
  Factory Reset
- การ Reset Device Secret แยกใช้คำว่า `Reset Secret` เพื่อป้องกันการกดยืนยันผิด
- ปิด dialog ได้อย่างปลอดภัยด้วยปุ่มปิด, Escape หรือ backdrop ตามบริบท

### Popup และข้อความแจ้งเตือน

- Dashboard และ Admin ใช้ popup/toast host ส่วนกลางที่ mount เพียงครั้งเดียว
- การทำงานสำเร็จ, ข้อผิดพลาด, คำเตือน, ข้อมูล, API timeout และ Critical Alarm
  แสดง popup บนหน้าจอ
- ป้องกัน popup เนื้อหาเดียวกันแสดงซ้ำในช่วงเวลาสั้น ๆ
- ไม่เหลือ native `alert()`, `confirm()` หรือ `prompt()` ใน Dashboard/Admin
- ข้อความ inline บางส่วนยังคงอยู่เพื่อให้ผู้ใช้ย้อนอ่านสถานะในฟอร์มได้

### ไฟล์และ CSS

- ลบ patch payload, installer และ README ส่งมอบรุ่นเก่าที่ไม่ใช่ runtime
- ลบ CSS fragment ที่ถูกรวมเข้า `shared-ui.css` แล้ว
- ลบ ESP32 preview entry/toolchain รุ่นเก่าที่ถูกแทนด้วย modular portal
- Dashboard CSS audit ไม่พบ exact duplicate ในชุด global ที่โหลดจริง
- เก็บ override ที่ selector คล้ายกันแต่ค่าหรือ cascade มีผลกับ layout จริง
- แก้ preview runner ให้ชี้ไปยัง modular CSS ปัจจุบัน

รายละเอียดผลตรวจเพิ่มเติมอยู่ใน `AUDIT_REPORT_20260713.md`

## 2. วิธีนำ ZIP ไปใช้งาน

### กรณีสร้างโฟลเดอร์ใหม่

1. สำรองโปรเจกต์เดิมก่อน
2. แตก ZIP จะได้โฟลเดอร์ `dotwatch`
3. ย้ายโฟลเดอร์ไปยังตำแหน่งที่ต้องการ เช่น `D:\IoT Project\dotwatch`
4. เปิด PowerShell ในโฟลเดอร์ดังกล่าว

```powershell
cd "D:\IoT Project\dotwatch"
```

### กรณีวางทับโปรเจกต์เดิม

1. สำรอง `.env` และข้อมูล runtime ที่ต้องใช้
2. หยุด Dashboard, Admin และ Backend ที่กำลังรัน
3. แตก ZIP ไว้ในโฟลเดอร์ชั่วคราว
4. คัดลอก **เนื้อหาภายใน** `dotwatch/` ไปทับโปรเจกต์เดิม
5. รัน cleanup เพื่อลบ patch/payload รุ่นเก่าที่การวางทับไม่สามารถลบให้ได้
6. อย่าลบ `.git` ของ repository เดิม และอย่านำ `.env` จริงขึ้น GitHub
7. ติดตั้ง dependencies ใหม่ด้วย `npm ci`

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File scripts/cleanup-obsolete-delivery-files.ps1 `
  -RepoRoot "D:\IoT Project\dotwatch"
```

แพ็กเกจไม่รวม `node_modules` และ `.env` จริงโดยตั้งใจ จึงไม่ควรคัดลอก
`node_modules` เก่าข้ามเครื่องหรือข้าม Node.js version

## 3. เตรียม Environment

ต้องมี Node.js 20 ขึ้นไป ตรวจสอบด้วย:

```powershell
node --version
npm --version
```

สร้างไฟล์ environment จากตัวอย่าง แล้วกรอกค่าของระบบจริงด้วยตนเอง:

```powershell
Copy-Item apps/dashboard/.env.local.example apps/dashboard/.env.local
Copy-Item apps/admin/.env.local.example apps/admin/.env.local
Copy-Item services/backend/.env.example services/backend/.env
```

ห้าม commit ไฟล์ `.env`, Firebase service-account JSON, private key, database
dump หรือข้อมูลรับรองจริง

## 4. ติดตั้ง Dependencies

วิธีมาตรฐานจาก root:

```powershell
npm run install:all
```

หากต้องการติดตั้งให้ตรงกับ lockfile ทุก package:

```powershell
npm ci --prefix apps/dashboard
npm ci --prefix apps/admin
npm ci --prefix services/backend
```

## 5. เปิดระบบสำหรับพัฒนา

เปิด PowerShell แยก 3 หน้าต่างจาก root ของโปรเจกต์

Backend:

```powershell
npm run backend:dev
```

Dashboard:

```powershell
npm run dashboard:dev
```

Admin:

```powershell
npm run admin:dev
```

Admin ถูกกำหนดให้ใช้ port 5174 จาก root script ส่วน URL ของ Dashboard และ
Backend ให้ดูค่าที่ Vite/Backend แสดงใน terminal และตรวจ `.env` ของแต่ละแอป

## 6. ตรวจสอบก่อน Deploy หรือ Push

```powershell
npm run audit:dashboard-style
npm run check:all
npm --prefix apps/admin run lint
npm --prefix esp32/dotwatch_esp32_product/portal-preview run check
npm --prefix esp8266/dotwatch_esp8266_product/portal-preview run check
```

ผลที่ยืนยันกับแพ็กเกจนี้แล้ว:

- Dashboard production build ผ่าน 2,704 modules
- Admin production build ผ่าน 102 modules
- Admin ESLint ผ่าน
- Backend syntax checks ผ่าน
- ESP32 และ ESP8266 modular portal checks ผ่าน

การ compile/upload firmware จริงต้องมี PlatformIO และอุปกรณ์ที่เกี่ยวข้อง

## 7. คำสั่ง Push ขึ้น GitHub

### 7.1 Repository เดิมที่ตั้งค่า remote แล้ว

ตรวจสอบก่อนว่าอยู่ใน repository และ remote ถูกต้อง:

```powershell
cd "D:\IoT Project\dotwatch"
git status
git remote -v
```

สร้าง branch สำหรับชุดแก้ไขนี้:

```powershell
git switch -c codex/system-consistency-cleanup
```

ตรวจว่าไม่มีไฟล์ลับติดเข้ามา แล้ว stage และ commit:

```powershell
git status --short
git add .
git status --short
git diff --cached --check
git commit -m "Standardize UI feedback and remove obsolete assets"
```

Push branch ขึ้น GitHub:

```powershell
git push -u origin codex/system-consistency-cleanup
```

หลัง push สามารถเปิด Pull Request บน GitHub จาก branch
`codex/system-consistency-cleanup` เข้า branch หลักของ repository

### 7.2 Repository ใหม่ที่ยังไม่มี remote

สร้าง empty repository บน GitHub ก่อน โดยไม่ต้องสร้าง README/.gitignore ซ้ำ
จากนั้นแทนที่ `<USER>` และ `<REPOSITORY>` ด้วยชื่อจริง:

```powershell
cd "D:\IoT Project\dotwatch"
git init
git branch -M main
git remote add origin https://github.com/<USER>/<REPOSITORY>.git
git add .
git status --short
git diff --cached --check
git commit -m "Initial cleaned dotWatch release"
git push -u origin main
```

หากใช้ SSH ให้เปลี่ยน remote เป็น:

```powershell
git remote add origin git@github.com:<USER>/<REPOSITORY>.git
```

### 7.3 หาก `origin` มีอยู่แต่ URL ไม่ถูกต้อง

```powershell
git remote get-url origin
git remote set-url origin https://github.com/<USER>/<REPOSITORY>.git
git remote -v
```

## 8. วิธีตรวจสอบหลัง Push

```powershell
git status
git branch --show-current
git log -1 --oneline
git remote -v
```

สถานะปกติควรแสดง working tree สะอาด และ branch ติดตาม `origin` แล้ว

## 9. หมายเหตุ Dependency

การติดตั้งล่าสุดรายงานช่องโหว่ 2 รายการใน Dashboard และ 9 รายการใน Backend
ยังไม่ได้ใช้ `npm audit fix --force` เพราะอาจอัปเกรด dependency แบบ breaking
ควรแยก branch เพื่อวิเคราะห์และทดสอบ dependency upgrade โดยเฉพาะ
