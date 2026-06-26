# Alarm Center Header Audit

## ตรวจพบจุดที่ไม่เท่าหน้าอื่น

ไฟล์ก่อนหน้าใช้ `PageHeader` แล้ว แต่มี CSS เฉพาะหน้า Alarm override ค่า default ของ dotWatch:

```text
.alarms-page > .dw-page-header {
  min-height: 140px
  align-items: center
}

.alarms-page > .dw-page-header .page-eyebrow {
  color: var(--danger)
}

.alarms-page > .dw-page-header .dw-page-header-main h1 {
  font-size: clamp(30px, 3vw, 42px)
  line-height: 0.95
  letter-spacing: -0.07em
}
```

ค่าเหล่านี้ทำให้หัวข้อ `Alarms` ดูไม่เท่าหน้าอื่น เช่น Activity / Notifications

## แก้แล้ว

เพิ่มไฟล์:

```text
src/styles/pages/alarm-center-header-exact-match.css
```

และ import หลังสุดใน:

```text
src/styles.css
```

เพื่อ reset ค่า header ของ Alarm Center กลับไปใช้ design system กลาง:

```text
h1: 30px
line-height: 1.12
letter-spacing: -0.045em
description: 14px / 1.6
eyebrow: var(--primary)
container padding: 24px
min-height: 0
```

## ปุ่ม

ปรับ JSX ให้ใช้ pattern เดียวกับ Notification Center:

```text
Refresh = secondary-button
Clear Alarm = primary-button alarm-clear-button
```
