# dotWatch Design Consistency Audit

## ตรวจพบปัญหาหลัก

จากการแก้หลายรอบก่อนหน้า มี CSS หลายชุดซ้อนกัน ทำให้หน้าตาในแต่ละหน้าเริ่มไม่เท่ากัน เช่น:

```text
- Page Header บางหน้าใช้ PageHeader บางหน้าใช้ app-page-header
- StatCard มีหลาย class และหลายความสูง
- แถบสีบน StatCard ไม่โค้งตามการ์ด
- Table / Search / Filter แต่ละหน้ามีขนาดไม่เท่ากัน
- Alarm Events sticky header ซ้อนกับ row ตอน scroll
- บางหน้า overflow ตอน sidebar เปิด
```

## วิธีแก้รอบนี้

เพิ่ม CSS ชั้นสุดท้าย:

```text
src/styles/dotwatch-design-system-lock.css
```

และ import ท้ายสุดใน:

```text
src/styles.css
```

ไฟล์นี้ทำหน้าที่เป็น final visual lock เพื่อให้ทุกหน้ากลับมาใช้จังหวะเดียวกัน

## สิ่งที่ปรับ

```text
- Page rhythm / gap กลาง
- Page Header กลาง
- Card / Panel radius, border, shadow
- Section Header
- StatCard height, value visibility, topbar radius
- Inputs / Search / Select
- Buttons
- Tables
- Alarm Events sticky header + scrollbar
- Empty State
- Scrollbars
- Responsive
```

## หน้าเป้าหมาย

```text
Dashboard
Devices
Device Detail
History
Alarm Center
Notifications
Activity
Profile
Settings
System Health
```
