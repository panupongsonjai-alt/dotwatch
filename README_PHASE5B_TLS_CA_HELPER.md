# dotWatch Phase 5B v2 — TLS Root CA Provisioning Helper

v2 แก้ปัญหา Windows PowerShell 5.1 ที่ไม่มี `ProcessStartInfo.ArgumentList` ทำให้ error:

```text
You cannot call a method on a null-valued expression.
```

ให้ใช้ไฟล์:

```text
dotwatch-phase5b-fetch-tls-ca.v2.ps1
```

## Run

```powershell
cd "D:\IoT Project\dotwatch"

powershell -NoProfile -ExecutionPolicy Bypass -File .\dotwatch-phase5b-fetch-tls-ca.v2.ps1 `
  -RepoRoot "D:\IoT Project\dotwatch" `
  -BackendHost "dotwatch-backend.onrender.com" `
  -OpenFolder
```

## Output

```text
_reports\tls-ca\YYYYMMDD-HHMMSS\
```

ใช้ไฟล์นี้ก่อน:

```text
esp32-ca-candidate.pem
```

ถ้าไม่ผ่าน ค่อยลอง:

```text
esp32-ca-bundle-excluding-server.pem
```

## Use with ESP32

```text
1. เปิด ESP32 Local Admin URL
2. ใส่ PIN
3. Copy PEM ทั้งไฟล์
4. วางในช่อง Root CA Certificate
5. Save & Restart
```

ถ้า ESP32 ส่งไม่ได้ ให้พิมพ์ `CLEAR` ในช่อง Root CA Certificate แล้ว Save & Restart
