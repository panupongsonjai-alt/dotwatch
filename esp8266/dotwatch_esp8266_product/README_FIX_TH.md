# แก้ไข ArduinoJson.h not found

ให้นำไฟล์ `platformio.ini` ไปแทนไฟล์เดิมที่:

`D:\IoT Project\dotwatch\esp8266\dotwatch_esp8266_product\platformio.ini`

จากนั้นรัน PowerShell:

```powershell
cd "D:\IoT Project\dotwatch\esp8266\dotwatch_esp8266_product"

py -m platformio run --target clean -e esp8266_oled
Remove-Item -Recurse -Force .pio -ErrorAction SilentlyContinue
py -m platformio run -e esp8266_oled
```

PlatformIO จะติดตั้ง `bblanchon/ArduinoJson` รุ่น 7.x โดยอัตโนมัติ
