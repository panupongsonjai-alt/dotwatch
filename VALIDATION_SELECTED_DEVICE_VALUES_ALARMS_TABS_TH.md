# Validation — Selected Device Values / Alarms Tabs

## ผ่าน

- แยกแท็บ `Values` และ `Alarms` ใน Selected Device
- ลบแท็บรวม `Values & Alarms`
- Values และ Alarms ใช้ `useDeviceMetrics(deviceId)` แหล่งเดียวกัน
- Alarms render จาก `draftMetrics.map(renderAlarmRules)` โดยไม่กรอง Hidden Value
- Values render จาก `draftMetrics.map(renderValueSettings)`
- Save Values บันทึกเฉพาะ Value configuration
- Save Alarms บันทึกเฉพาะ Alarm Rules
- Reset Alarm Drafts ไม่เรียก Reset Values
- Warning และ Critical แสดงแยกสำหรับทุก Value
- Scrollbar ทำงานเมื่อมีมากกว่า 3 Value ทั้งสองแท็บ
- Fixed Model policy ของ `dot-TH-W1` และ `dot-WT-W1` ยังคงอยู่
- Verification script ผ่าน
- TypeScript parser ตรวจ JSX ทั้ง 3 ไฟล์ผ่าน
- CSS parse ด้วย `tinycss2` ผ่าน
- Verification script ผ่าน `node --check`
- ZIP integrity ผ่าน
- ไม่แก้ Backend หรือ Database
- ไม่ต้องรัน Migration

## Production Build

มีการเรียก:

```text
npm --prefix apps/dashboard run build
```

แต่สภาพแวดล้อมจัดทำไฟล์ไม่มี Dashboard dependencies และหยุดด้วย:

```text
vite: not found
```

จึงต้องรัน `npm ci` และ Production Build บนเครื่อง Local ก่อน Push
