# Alarm Center Design Audit

## สรุปปัญหาที่พบ

หน้า Alarm Center ยังไม่เท่าหน้าอื่น เพราะมี CSS เฉพาะหน้า Alarm จากหลาย patch ซ้อนกัน:

```text
alarm-center-actions-statrow.css
alarm-center-pageheader-unify.css
alarm-center-header-exact-match.css
```

ไฟล์เหล่านี้ override ค่าเดียวกับ `PageHeader` กลาง เช่น:

```text
min-height
font-size
line-height
eyebrow color
button size
action position
```

ทำให้หัวข้อ `Alarms` ดูไม่เท่ากับหน้า:

```text
Notifications
Activity
Profile
Settings
System Health
```

## วิธีแก้รอบนี้

1. ลบ import CSS เฉพาะ Alarm เก่าที่ชนกันออกจาก `styles.css`
2. ใช้ไฟล์เดียวที่ import หลังสุด:

```text
alarm-center-final-align.css
```

3. ให้ JSX ของ `Alarms.jsx` ใช้ pattern เดียวกับ `NotificationCenter.jsx`:

```jsx
<PageHeader
  eyebrow="Alarm Center"
  title="Alarms"
  description="..."
  actions={
    <>
      <button className="secondary-button">Refresh</button>
      <button className="primary-button alarm-clear-button">Clear Alarm</button>
    </>
  }
/>
```

## ค่า design ที่บังคับให้เท่ากลาง

```text
Header padding: 24px
Title font-size: 30px
Title line-height: 1.12
Title letter-spacing: -0.045em
Description font-size: 14px
Description line-height: 1.6
Eyebrow color: var(--primary)
Actions top padding: 0
Button height: 40px
```
