# Alarm Center Header Match Audit

## สิ่งที่ยังไม่เหมือน

สาเหตุหลักคือหน้า Alarm Center มี CSS เฉพาะ header จากหลาย patch ก่อนหน้าที่ไป override ค่า `PageHeader` กลาง เช่น:

```text
h1 font-size
line-height
description weight
eyebrow color
button style
header min-height
```

ทำให้แม้ JSX จะใช้ `PageHeader` แล้ว แต่หน้าตายังไม่เท่าหน้า `Notifications` และ `Activity`

## วิธีแก้รอบนี้

เปลี่ยนแนวทางเป็น:

```text
ไม่แต่ง PageHeader เฉพาะหน้า Alarm อีก
```

ให้ Alarm Center ใช้ `PageHeader` กลางเหมือนหน้าอื่นโดยตรง และใช้ CSS ใหม่ดูแลเฉพาะ layout ภายในหน้า:

```text
alarm-center-match-page-pattern.css
```

## ไฟล์ CSS เก่าที่ถอด import ออก

```text
alarm-center-actions-statrow.css
alarm-center-pageheader-unify.css
alarm-center-header-exact-match.css
alarm-center-final-align.css
```

## JSX Header ใหม่

เหมือน NotificationCenter:

```jsx
<PageHeader
  eyebrow="Alarm Center"
  title="Alarms"
  description="..."
  actions={
    <>
      <button className="secondary-button">Refresh</button>
      <button className="primary-button">Clear Alarm</button>
    </>
  }
/>
```
