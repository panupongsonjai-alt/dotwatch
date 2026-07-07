# Design Stabilizer Notes

รอบนี้ล้างแนวทางเก่าที่ใช้ CSS หลายไฟล์ทับกัน แล้วใช้ final layer ตัวเดียวที่เบากว่า:

```text
src/styles/dotwatch-design-stabilizer.css
```

ลบ import ที่เสี่ยงชนกัน เช่น:

```text
dotwatch-design-system-lock.css
statcard-topbar-polish.css
statcard-topbar-inset-pill.css
statcard-topbar-radius-fix.css
statcard-height-unify.css
statcard-value-visibility-fix.css
statcard-final-balance.css
statcard-content-fit-final.css
```

เป้าหมายคือแก้ visual bug โดยไม่ redesign ทั้งระบบ
