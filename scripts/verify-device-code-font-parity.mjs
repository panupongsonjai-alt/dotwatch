import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const cssPath = path.join(root, 'apps/dashboard/src/styles/devices.css')
const typographyPath = path.join(root, 'apps/dashboard/src/styles/typography-system.css')

for (const filePath of [cssPath, typographyPath]) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing required file: ${path.relative(root, filePath)}`)
  }
}

const css = fs.readFileSync(cssPath, 'utf8')
const typography = fs.readFileSync(typographyPath, 'utf8')

const selector = '.devices-v3-security-list .devices-v3-device-code-plain'
const selectorIndex = css.lastIndexOf(selector)
if (selectorIndex < 0) {
  throw new Error('Device Code typography selector was not found.')
}

const blockStart = css.indexOf('{', selectorIndex)
const blockEnd = css.indexOf('}', blockStart)
const block = css.slice(blockStart + 1, blockEnd)

const requirements = [
  /font-family:\s*var\(--dw-font-sans\)\s*!important\s*;/,
  /font-variant-numeric:\s*normal\s*;/,
  /letter-spacing:\s*normal\s*;/,
]

for (const requirement of requirements) {
  if (!requirement.test(block)) {
    throw new Error(`Device Code typography requirement missing: ${requirement}`)
  }
}

if (!/code,[\s\S]*font-family:\s*var\(--dw-font-mono\)\s*!important/.test(typography)) {
  throw new Error('The global monospace rule is missing; the targeted override may be unnecessary or unsafe.')
}

console.log('PASS: Device Code uses the same sans typography family as Model.')
console.log('PASS: Device Secret and other code surfaces remain monospace.')
