# dotWatch — LINE และ Email Alarm Notifications

ระบบนี้ส่งข้อความเมื่อ Alarm เปลี่ยนสถานะเท่านั้น จึงไม่ส่งซ้ำทุกครั้งที่อุปกรณ์ส่งค่าเข้ามา รองรับทั้งตอนเริ่ม Alarm และตอนค่ากลับสู่ปกติ

## 1. ตั้งค่า LINE Messaging API

LINE Notify ยุติบริการแล้ว ระบบจึงใช้ LINE Messaging API ผ่าน LINE Official Account

1. สร้าง Provider และ Messaging API Channel ที่ LINE Developers Console
2. ออก Channel access token ในแท็บ Messaging API
3. เพิ่ม Environment Variable ใน Render backend:

   `LINE_CHANNEL_ACCESS_TOKEN=<channel-access-token>`

4. ผู้รับต้องเพิ่ม LINE Official Account เป็นเพื่อนก่อน
5. นำ User ID, Group ID หรือ Room ID ที่ได้จาก webhook มาใส่ใน Dashboard > Settings > Alarm Notifications

ห้ามใส่ Channel access token ลงไฟล์ `.env` ที่จะ commit หรือใส่ในช่อง LINE Target ID

## 2. ตั้งค่า Email ด้วย Resend

1. สร้างบัญชีและ API key ที่ Resend
2. ยืนยันโดเมนผู้ส่งกับ Resend
3. เพิ่ม Environment Variables ใน Render backend:

   `RESEND_API_KEY=<resend-api-key>`

   `EMAIL_FROM=dotWatch Alerts <alerts@your-domain.com>`

4. ใน Dashboard > Settings > Alarm Notifications เปิด Email และกำหนดอีเมลปลายทาง หากเว้นว่างจะใช้อีเมลของบัญชีที่ล็อกอิน

## 3. Deploy บน Render

1. Push ไฟล์ขึ้น GitHub
2. เปิด Render backend > Environment แล้วเพิ่มค่าด้านบน
3. รัน migration ด้วยคำสั่ง `npm run backend:migrate` โดยใช้ `DATABASE_URL` ของ Render
4. Deploy backend และ dashboard รุ่นเดียวกัน
5. เข้า Settings บันทึกค่า แล้วกด Test LINE / Test Email

## 4. ผลทดสอบที่คาดหวัง

- ผ่าน: Dashboard แสดงข้อความว่าส่งข้อความทดสอบแล้ว และผู้รับได้รับข้อความ
- LINE ไม่ผ่าน: ตรวจ Channel access token, Target ID และการเพิ่ม Official Account เป็นเพื่อน
- Email ไม่ผ่าน: ตรวจ API key, โดเมนผู้ส่ง และค่า `EMAIL_FROM`
- HTTP 429: กดทดสอบเกิน 5 ครั้งใน 15 นาที ให้รอก่อนทดสอบใหม่

การส่งข้อความทำงานแบบไม่บล็อก ingest หากผู้ให้บริการภายนอกล่ม การรับและบันทึกค่าอุปกรณ์ยังทำงานต่อได้
