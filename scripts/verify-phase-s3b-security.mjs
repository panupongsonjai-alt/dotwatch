import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const failures = []
const passes = []

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}
function expect(condition, passMessage, failMessage) {
  if (condition) passes.push(passMessage)
  else failures.push(failMessage)
}

const platformio = read('esp32/dotwatch_esp32_product/platformio.ini')
const sdkCommon = read('esp32/dotwatch_esp32_product/sdkconfig.secure.common')
const sdkPilot = read('esp32/dotwatch_esp32_product/sdkconfig.secure.pilot')
const sdkRelease = read('esp32/dotwatch_esp32_product/sdkconfig.secure.release')
const sdkLocalExample = read('esp32/dotwatch_esp32_product/sdkconfig.secure.local.example')
const partitions = read('esp32/dotwatch_esp32_product/partitions_secure_ota.csv')
const cmake = read('esp32/dotwatch_esp32_product/CMakeLists.txt')
const srcCmake = read('esp32/dotwatch_esp32_product/src/CMakeLists.txt')
const posture = read('esp32/dotwatch_esp32_product/src/security/SecurityPosture.cpp')
const app = read('esp32/dotwatch_esp32_product/src/app/AppController.cpp')
const ota = read('esp32/dotwatch_esp32_product/src/ota/OtaManager.cpp')
const version = read('esp32/dotwatch_esp32_product/include/FirmwareVersion.h')
const productConfig = read('esp32/dotwatch_esp32_product/include/ProductConfig.h')
const keygen = read('scripts/esp32-security-generate-keys.ps1')
const readiness = read('scripts/esp32-security-readiness.ps1')
const backup = read('scripts/esp32-security-backup-flash.ps1')
const build = read('scripts/esp32-security-build.ps1')
const provision = read('scripts/esp32-security-provision.ps1')
const verifyDevice = read('scripts/esp32-security-verify-device.ps1')
const gitignore = read('.gitignore')

expect(
  platformio.includes('default_envs = esp32_product') &&
    platformio.includes('[env:esp32_product_secure_pilot]') &&
    platformio.includes('[env:esp32_product_secure_release]') &&
    platformio.match(/framework\s*=\s*arduino, espidf/g)?.length === 2,
  'Normal Arduino build remains default while secure pilot/release builds use Arduino as an ESP-IDF component',
  'Secure PlatformIO environment separation is incomplete'
)

expect(
  cmake.includes('project(dotwatch_esp32_product)') &&
    srcCmake.includes('idf_component_register') &&
    srcCmake.includes('GLOB_RECURSE') &&
    !srcCmake.match(/file\s*\([^\r\n]*CONFIGURE_DEPENDS/i) &&
    !srcCmake.match(/^[ \t]*arduino[ \t]*$/m),
  'ESP-IDF component build includes the modular Arduino firmware sources',
  'ESP-IDF CMake integration is incomplete'
)

expect(
  sdkCommon.includes('CONFIG_ESP32_REV_MIN_3=y') || read('esp32/dotwatch_esp32_product/sdkconfig.defaults').includes('CONFIG_ESP32_REV_MIN_3=y'),
  'Secure Boot v2 profile requires ESP32 chip revision v3 or newer',
  'ESP32 revision-v3 minimum is not enforced'
)

expect(
  sdkCommon.includes('CONFIG_SECURE_BOOT_V2_ENABLED=y') &&
    sdkCommon.includes('CONFIG_SECURE_BOOT_V2_RSA_ENABLED=y') &&
    sdkCommon.includes('CONFIG_SECURE_BOOT_BUILD_SIGNED_BINARIES=y') &&
    sdkLocalExample.includes('CONFIG_SECURE_BOOT_SIGNING_KEY='),
  'Secure builds require RSA-3072 Secure Boot v2 signed bootloader and apps',
  'Secure Boot v2 build configuration is incomplete'
)

expect(
  sdkCommon.includes('CONFIG_SECURE_FLASH_ENC_ENABLED=y') &&
    sdkCommon.includes('CONFIG_NVS_ENCRYPTION=y') &&
    sdkCommon.includes('CONFIG_NVS_SEC_KEY_PROTECT_USING_FLASH_ENC=y'),
  'Flash encryption and encrypted NVS key protection are enabled together',
  'Flash or NVS encryption configuration is incomplete'
)

expect(
  sdkPilot.includes('CONFIG_SECURE_FLASH_ENCRYPTION_MODE_DEVELOPMENT=y') &&
    sdkPilot.includes('CONFIG_SECURE_BOOT_ALLOW_JTAG=y') &&
    sdkRelease.includes('CONFIG_SECURE_FLASH_ENCRYPTION_MODE_RELEASE=y') &&
    sdkRelease.includes('# CONFIG_SECURE_BOOT_ALLOW_JTAG is not set') &&
    sdkRelease.includes('# CONFIG_SECURE_FLASH_UART_BOOTLOADER_ALLOW_DEC is not set'),
  'Expendable pilot and production release profiles have explicit recovery/security boundaries',
  'Pilot and release security profiles are not safely separated'
)

const rows = partitions
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#'))
  .map((line) => line.split(',').map((value) => value.trim()))
const byName = new Map(rows.map((row) => [row[0], row]))
const ota0 = byName.get('ota_0')
const ota1 = byName.get('ota_1')
expect(
  byName.has('nvs_keys') &&
    byName.get('nvs_keys')?.[5] === 'encrypted' &&
    byName.get('spiffs')?.[5] === 'encrypted' &&
    ota0?.[3] === '0x20000' && ota0?.[4] === '0x170000' &&
    ota1?.[3] === '0x190000' && ota1?.[4] === '0x170000',
  'Secure partition table reserves bootloader space, aligned dual OTA slots, NVS keys, and encrypted data',
  'Secure partition layout is invalid or incomplete'
)

expect(
  posture.includes('esp_secure_boot_enabled()') &&
    posture.includes('esp_flash_encryption_enabled()') &&
    app.includes('SecurityPosture::meetsBuildPolicy()') &&
    app.includes('while (true) delay(1000)'),
  'Secure firmware fails closed when hardware security state does not match the build policy',
  'Runtime hardware-security policy enforcement is incomplete'
)

expect(
  ota.includes('secureBootEnabled') && ota.includes('flashEncryptionEnabled') && ota.includes('chipRevision'),
  'OTA audit reports include hardware trust posture',
  'OTA hardware trust telemetry is missing'
)

const firmwareVersionMatch = version.match(
  /DOTWATCH_FIRMWARE_VERSION\s+"([^"]+)"/
)
const firmwareBuildMatch = version.match(
  /DOTWATCH_FIRMWARE_BUILD\s+(\d+)UL/
)
const otaMaxFirmwareBytesMatch = productConfig.match(
  /OTA_MAX_FIRMWARE_BYTES\s*=\s*(0x[0-9a-fA-F]+|\d+)UL/
)

const firmwareBuild = Number(firmwareBuildMatch?.[1] || 0)
const otaMaxFirmwareBytes = Number(
  otaMaxFirmwareBytesMatch?.[1] || Number.NaN
)

expect(
  Boolean(firmwareVersionMatch?.[1]) &&
    firmwareBuild >= 1400 &&
    otaMaxFirmwareBytes === 0x170000,
  'Firmware version/build is monotonic and OTA maximum matches secure partition slots',
  'Firmware version/build regressed or secure OTA size limit is incorrect'
)

expect(
  keygen.includes('KeyRoot must be outside the dotwatch repository') &&
    keygen.includes('generate_signing_key') && keygen.includes('rsa3072') &&
    !keygen.includes('generate_flash_encryption_key') &&
    gitignore.includes('sdkconfig.secure.local') &&
    gitignore.includes('*.flash-encryption-key.bin'),
  'Secure Boot private keys remain outside Git while ESP32 generates its protected flash key on first boot',
  'Hardware security key handling is unsafe'
)

expect(
  readiness.includes('revisionSupportsSecureBootV2') && readiness.includes('espefuse') &&
    backup.includes('read_flash') && backup.includes('efuse-summary-before.txt') &&
    build.includes('firmware-signed.bin') &&
    build.includes('bootloader-signed.bin') &&
    build.includes('partitions-signed.bin') &&
    build.includes('verify_signature') &&
    build.includes('Ensure-PythonModule') &&
    build.includes('-Module "ecdsa"') &&
    build.includes('0x170000'),
  'Readiness, full-flash backup, dependency preflight, all-image signature verification, and signed-size gates precede provisioning',
  'Pre-provision safety gates are incomplete'
)

expect(
  provision.includes('ExecuteIrreversible') &&
    provision.includes('ENABLE_HARDWARE_TRUST_') &&
    provision.includes('PLAN ONLY') &&
    provision.includes('AllowReleaseMode') &&
    !provision.includes('--do-not-confirm') &&
    !provision.match(/espefuse[^\r\n]*(burn_|burn-|burn )/i) &&
    verifyDevice.includes('ABS_DONE_1') && verifyDevice.includes('FLASH_CRYPT_CNT'),
  'Irreversible provisioning requires device-bound confirmation and post-boot eFuse verification',
  'Irreversible provisioning safeguards are incomplete'
)

for (const message of passes) console.log(`PASS: ${message}`)
if (failures.length) {
  for (const message of failures) console.error(`FAIL: ${message}`)
  process.exit(1)
}
console.log(`Phase S3B security verification passed (${passes.length} checks).`)
