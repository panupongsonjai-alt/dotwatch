import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const product = path.join(root, 'esp32/dotwatch_esp32_product')
const provision = fs.readFileSync(path.join(root, 'scripts/esp32-security-provision.ps1'), 'utf8')
const keygen = fs.readFileSync(path.join(root, 'scripts/esp32-security-generate-keys.ps1'), 'utf8')
const release = fs.readFileSync(path.join(product, 'sdkconfig.secure.release'), 'utf8')
const pilot = fs.readFileSync(path.join(product, 'sdkconfig.secure.pilot'), 'utf8')
const partitions = fs.readFileSync(path.join(product, 'partitions_secure_ota.csv'), 'utf8')

assert.match(provision, /if \(-not \$ExecuteIrreversible\)/)
assert.match(provision, /if \(\$Confirmation -cne \$token\)/)
assert.match(provision, /ENABLE_HARDWARE_TRUST_/)
assert.doesNotMatch(provision, /--do-not-confirm/)
assert.doesNotMatch(provision, /espefuse[^\r\n]*(burn_efuse|burn_key|burn_key_digest)/i)
console.log('PASS: provisioning is plan-only by default and has no direct unattended eFuse burn command')

assert.match(keygen, /KeyRoot must be outside the dotwatch repository/)
assert.match(keygen, /generate_signing_key.+rsa3072/s)
assert.doesNotMatch(keygen, /generate_flash_encryption_key/)
console.log('PASS: fleet Secure Boot private key uses guarded external storage; flash key is device-generated')

assert.match(pilot, /CONFIG_SECURE_FLASH_ENCRYPTION_MODE_DEVELOPMENT=y/)
assert.match(pilot, /CONFIG_SECURE_BOOT_ALLOW_JTAG=y/)
assert.match(release, /CONFIG_SECURE_FLASH_ENCRYPTION_MODE_RELEASE=y/)
assert.match(release, /# CONFIG_SECURE_BOOT_ALLOW_JTAG is not set/)
assert.match(release, /# CONFIG_SECURE_FLASH_UART_BOOTLOADER_ALLOW_DEC is not set/)
console.log('PASS: pilot retains an explicit recovery boundary while release mode closes plaintext debug paths')

const parseHex = (value) => Number.parseInt(value, 16)
const rows = partitions.split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#'))
  .map((line) => line.split(',').map((value) => value.trim()))
const parts = rows.map(([name, type, subtype, offset, size, flags]) => ({
  name, type, subtype, offset: parseHex(offset), size: parseHex(size), flags,
}))
for (const part of parts) {
  assert.ok(Number.isFinite(part.offset) && Number.isFinite(part.size), `invalid partition ${part.name}`)
  assert.ok(part.offset + part.size <= 0x400000, `${part.name} exceeds 4MB flash`)
}
const ordered = [...parts].sort((a, b) => a.offset - b.offset)
for (let index = 1; index < ordered.length; index += 1) {
  assert.ok(
    ordered[index - 1].offset + ordered[index - 1].size <= ordered[index].offset,
    `${ordered[index - 1].name} overlaps ${ordered[index].name}`
  )
}
for (const name of ['ota_0', 'ota_1']) {
  const part = parts.find((item) => item.name === name)
  assert.equal(part.offset % 0x10000, 0, `${name} must be 64KB aligned`)
  assert.equal(part.size, 0x170000)
}
console.log('PASS: secure 4MB partition layout is non-overlapping and OTA app offsets are 64KB aligned')

console.log('Phase S3B safety tests passed.')
