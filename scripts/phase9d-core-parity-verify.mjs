import fs from 'node:fs'

const file = 'scripts/phase9-core-parity-check.ps1'
const text = fs.readFileSync(file, 'utf8')

const required = [
  'function New-StringHashSet',
  'Windows PowerShell expands arrays passed to New-Object',
  "$leftSet = New-StringHashSet -Items $Left",
  "$rightSet = New-StringHashSet -Items $Right",
  "New-Object 'System.Collections.Generic.HashSet[string]'"
]

const missing = required.filter((needle) => !text.includes(needle))
if (missing.length) {
  console.error('Phase 9D verify failed. Missing markers:')
  for (const item of missing) console.error(`- ${item}`)
  process.exit(1)
}

const forbidden = [
  "$leftSet = New-Object 'System.Collections.Generic.HashSet[string]' ([string[]]$Left)",
  "$rightSet = New-Object 'System.Collections.Generic.HashSet[string]' ([string[]]$Right)"
]
const foundForbidden = forbidden.filter((needle) => text.includes(needle))
if (foundForbidden.length) {
  console.error('Phase 9D verify failed. Forbidden old HashSet constructor usage remains:')
  for (const item of foundForbidden) console.error(`- ${item}`)
  process.exit(1)
}

console.log('Phase 9D Core Parity verify: OK')
