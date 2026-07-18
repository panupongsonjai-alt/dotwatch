# Mobile P0 Stabilization — 2026-07-18

## Scope

รอบนี้แก้เฉพาะปัญหาที่กระทบความพร้อมใช้งานและความปลอดภัยของ Mobile App
โดยไม่เพิ่มฟีเจอร์ Dashboard ขนาดใหญ่

## Completed

1. Firebase Authentication persistence
   - Android/iOS ใช้ `initializeAuth`
   - ใช้ `getReactNativePersistence(AsyncStorage)`
   - Web ยังคงใช้ Firebase browser persistence

2. Environment fail-fast
   - ตรวจ `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_WS_URL` และ Firebase config
   - URL production ต้องเป็น `https://` และ `wss://`
   - แสดงหน้าข้อผิดพลาดที่อ่านได้เมื่อ Environment ไม่ครบ
   - Release checker ตรวจค่าจริง ไม่ได้ตรวจเพียงว่ามีไฟล์ `.env`

3. Dynamic Device Values
   - อ่าน Value config จาก `/api/devices/:id/metrics`
   - Latest cards รองรับชื่อ หน่วย ลำดับ การซ่อน และ decimal places
   - History เลือก Value ใดก็ได้ ไม่ยึด `temperature` และ `humidity`
   - มี fallback จาก `latest_metrics` เมื่อ Metric config API ใช้งานไม่ได้

4. Push token lifecycle
   - Logout ยกเลิก Push Token ของอุปกรณ์ก่อน Firebase sign out
   - Query cache ถูกล้างหลัง Logout
   - Register token ใหม่จะ deactivate token เดียวกันของบัญชีอื่น

5. Database migration
   - เพิ่ม `025_mobile_push_tokens.sql`
   - รวมเข้ากับ migration runner หลัก
   - มี standalone command `mobile-push:migrate`
   - เพิ่ม partial unique index สำหรับ active Expo Push Token

6. Tooling
   - ถอด local `eas-cli`
   - ใช้ `npx eas`
   - ปรับ app version เป็น `0.2.0` ให้ตรงกับ package version
   - อัปเดต README ให้ตรงกับฟังก์ชันจริง

## Validation performed

- Mobile TypeScript: PASS
- Android Expo export: PASS
- Web Expo export: PASS
- Mobile release structure/environment check with test values: PASS
- Backend syntax check: PASS
- Expo Doctor: 16/18; สอง check ที่เหลือไม่ทำงานเพราะ environment ตรวจสอบเชื่อมต่อ Expo API ไม่ได้
- Production dependency audit: 18 moderate, 0 high, 0 critical

## Production gates still required

1. Set real `EXPO_PUBLIC_*` values in EAS Build Environment
2. Deploy backend migration 025 to production database
3. Build Preview APK
4. Test Firebase cold-start session on a physical Android device
5. Test Push in foreground, background and killed state
6. Verify logout stops notifications for the previous account
7. Build Production AAB only after all physical-device gates pass
