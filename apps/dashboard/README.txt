วางไฟล์ public/favicon.svg ใน dotwatch-dashboard/public/favicon.svg
จากนั้นแก้ dotwatch-dashboard/index.html ให้มีบรรทัดนี้ใน <head>:
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />

ถ้า browser ยังไม่เปลี่ยน ให้ Hard Refresh: Ctrl + Shift + R
