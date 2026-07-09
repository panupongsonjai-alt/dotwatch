import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const failures = []
const warnings = []

function resolveRepo(...parts) {
  return path.join(repoRoot, ...parts)
}

function read(relativePath) {
  const fullPath = resolveRepo(relativePath)

  if (!fs.existsSync(fullPath)) {
    failures.push(`Missing required file: ${relativePath}`)
    return ''
  }

  return fs.readFileSync(fullPath, 'utf8')
}

function pass(message) {
  console.log(`OK   ${message}`)
}

function fail(message) {
  failures.push(message)
}

function warn(message) {
  warnings.push(message)
}

function assertIncludes(relativePath, text, message) {
  const content = read(relativePath)

  if (!content.includes(text)) {
    fail(`${message} (${relativePath})`)
    return
  }

  pass(message)
}

function scanBalance(relativePath) {
  const content = read(relativePath)
  const stack = []
  let quote = null
  let escaped = false
  let line = 1
  let blockComment = false
  let lineComment = false

  const pairs = {
    ')': '(',
    ']': '[',
    '}': '{',
  }

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index]
    const next = content[index + 1]

    if (char === '\n') {
      line += 1
      lineComment = false
      continue
    }

    if (lineComment) continue

    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false
        index += 1
      }
      continue
    }

    if (quote) {
      if (escaped) {
        escaped = false
        continue
      }

      if (char === '\\') {
        escaped = true
        continue
      }

      if (char === quote) {
        quote = null
      }

      continue
    }

    if (char === '/' && next === '/') {
      lineComment = true
      index += 1
      continue
    }

    if (char === '/' && next === '*') {
      blockComment = true
      index += 1
      continue
    }

    const previousCode = content.slice(0, index).replace(/\s+$/g, '').at(-1)
    const looksLikeRegex =
      char === '/' &&
      next !== '/' &&
      next !== '*' &&
      (!previousCode || '([{=,:;!&|?'.includes(previousCode))

    if (looksLikeRegex) {
      index += 1

      while (index < content.length) {
        const regexChar = content[index]
        const regexNext = content[index + 1]

        if (regexChar === '\\') {
          index += 2
          continue
        }

        if (regexChar === '\n') {
          line += 1
          break
        }

        if (regexChar === '/') {
          index += 1
          while (/[a-z]/i.test(content[index] || '')) {
            index += 1
          }
          break
        }

        index += 1
      }

      continue
    }

    if (char === '\'' || char === '"' || char === '`') {
      quote = char
      continue
    }

    if (char === '(' || char === '[' || char === '{') {
      stack.push({ char, line })
      continue
    }

    if (pairs[char]) {
      const top = stack.pop()

      if (!top || top.char !== pairs[char]) {
        fail(`${relativePath}: unexpected ${char} at line ${line}`)
        return
      }
    }
  }

  if (quote) {
    fail(`${relativePath}: unterminated string/template literal`)
    return
  }

  if (blockComment) {
    fail(`${relativePath}: unterminated block comment`)
    return
  }

  if (stack.length) {
    const top = stack[stack.length - 1]
    fail(`${relativePath}: unclosed ${top.char} opened near line ${top.line}`)
    return
  }

  pass(`${relativePath} delimiter balance`)
}

function verifyStyleManifest() {
  const relativePath = 'apps/dashboard/src/styles.css'
  const content = read(relativePath)
  const imports = [...content.matchAll(/@import\s+['"]([^'"]+)['"];?/g)].map(
    (match) => match[1]
  )
  const seen = new Set()

  for (const importPath of imports) {
    if (seen.has(importPath)) {
      fail(`Duplicate dashboard style import: ${importPath}`)
    }

    seen.add(importPath)

    const fullPath = path.join(repoRoot, 'apps/dashboard/src', importPath)

    if (!fs.existsSync(fullPath)) {
      fail(`Missing dashboard style import target: ${importPath}`)
    }
  }

  if (!imports.includes('./styles/phase5-ux-stabilizer.css')) {
    fail('Phase 5 UX stabilizer CSS is not imported last from styles.css')
  } else if (imports[imports.length - 1] !== './styles/phase5-ux-stabilizer.css') {
    fail('Phase 5 UX stabilizer CSS must be the final dashboard style import')
  } else {
    pass('Dashboard style manifest imports Phase 5 UX stabilizer last')
  }
}

function verifyDashboardApp() {
  const app = read('apps/dashboard/src/App.jsx')

  const workspaceHelpCount = (app.match(/function\s+WorkspaceHelp\s*\(/g) || [])
    .length

  if (workspaceHelpCount !== 1) {
    fail(`Expected exactly 1 WorkspaceHelp declaration, found ${workspaceHelpCount}`)
  } else {
    pass('Dashboard WorkspaceHelp declaration count')
  }

  for (const requiredText of [
    "import ApiStatusBanner from './components/ApiStatusBanner.jsx'",
    "import AppErrorBoundary from './components/AppErrorBoundary.jsx'",
    '<ApiStatusBanner />',
    '<AppErrorBoundary',
    'LoadingState',
    'document.title = `${currentPageMeta.title} · dotWatch`',
  ]) {
    if (!app.includes(requiredText)) {
      fail(`Dashboard App.jsx missing: ${requiredText}`)
    }
  }

  if (app.includes('return <div className="loading">Loading...</div>')) {
    fail('Dashboard App.jsx still uses raw loading div instead of LoadingState')
  }

  pass('Dashboard App.jsx Phase 5 guard markers')
}

function verifyCommonExports() {
  const index = read('apps/dashboard/src/components/common/index.js')

  for (const requiredText of [
    "export { default as LoadingState } from './LoadingState.jsx'",
    "export { default as NoticeBanner } from './NoticeBanner.jsx'",
  ]) {
    if (!index.includes(requiredText)) {
      fail(`Common component index missing: ${requiredText}`)
    }
  }

  pass('Dashboard common exports include Phase 5 primitives')
}

function verifyAdminApi() {
  const adminApi = read('apps/admin/src/services/adminApi.js')

  for (const requiredText of [
    'function normalizeApiUrl',
    'function assertAdminApiPath',
    'AbortController',
    'dotwatchAdminApiTimeout',
    'dotwatchAdminApiAuthError',
    "headers.set('X-dotWatch-Client', 'admin')",
    'forceRefresh: true',
  ]) {
    if (!adminApi.includes(requiredText)) {
      fail(`Admin API missing guard marker: ${requiredText}`)
    }
  }

  if (/fetch\(`\$\{API_URL\}\$\{path\}`\s*,\s*\{\s*\.\.\.options,\s*headers:/s.test(adminApi)) {
    warn('Admin API may still use the old direct fetch/header style')
  }

  pass('Admin API Phase 5 guard markers')
}

function verifyAdminApp() {
  const app = read('apps/admin/src/App.jsx')

  for (const requiredText of [
    'ADMIN_PAGE_STORAGE_KEY',
    'getStoredAdminPage',
    'refreshAdminData',
    'dotwatchAdminApiTimeout',
    'dotwatchAdminApiAuthError',
    'admin-page-toolbar',
  ]) {
    if (!app.includes(requiredText)) {
      fail(`Admin App missing UX marker: ${requiredText}`)
    }
  }

  pass('Admin App Phase 5 UX markers')
}

function verifyMockDeviceModels() {
  const adminApi = read('apps/admin/src/services/adminApi.js')
  const esp32Block = adminApi.match(/modelKey:\s*'esp32_dht3'[\s\S]*?metrics:\s*\[([\s\S]*?)\]\s*,/)

  if (!esp32Block) {
    fail('Unable to find ESP32-DHT3 mock model metrics block')
    return
  }

  const metricKeys = [...esp32Block[1].matchAll(/metricKey:\s*'([^']+)'/g)].map(
    (match) => match[1]
  )
  const duplicates = metricKeys.filter(
    (key, index) => metricKeys.indexOf(key) !== index
  )

  if (duplicates.length) {
    fail(`Duplicate ESP32-DHT3 mock metric keys: ${[...new Set(duplicates)].join(', ')}`)
    return
  }

  pass('ESP32-DHT3 mock model metric keys are unique')
}

function verifyPackageScripts() {
  const packageJson = JSON.parse(read('package.json'))

  if (packageJson.scripts?.['verify:phase5:ux'] !== 'node scripts/phase5-ux-verify.mjs') {
    fail('package.json missing verify:phase5:ux script')
    return
  }

  pass('package.json verify:phase5:ux script')
}

function verifyRequiredFiles() {
  for (const relativePath of [
    'apps/dashboard/src/components/AppErrorBoundary.jsx',
    'apps/dashboard/src/components/ApiStatusBanner.jsx',
    'apps/dashboard/src/components/common/LoadingState.jsx',
    'apps/dashboard/src/components/common/NoticeBanner.jsx',
    'apps/dashboard/src/styles/phase5-ux-stabilizer.css',
    'docs/PHASE5_DASHBOARD_ADMIN_UX_STABILIZATION.md',
  ]) {
    read(relativePath)
  }

  pass('Required Phase 5 UX files exist')
}

console.log('dotWatch Phase 5 UX verify')
console.log(`Root: ${repoRoot}`)
console.log('')

verifyRequiredFiles()
verifyStyleManifest()
verifyDashboardApp()
verifyCommonExports()
verifyAdminApi()
verifyAdminApp()
verifyMockDeviceModels()
verifyPackageScripts()

for (const relativePath of [
  'apps/dashboard/src/App.jsx',
  'apps/dashboard/src/components/AppErrorBoundary.jsx',
  'apps/dashboard/src/components/ApiStatusBanner.jsx',
  'apps/dashboard/src/components/common/LoadingState.jsx',
  'apps/dashboard/src/components/common/NoticeBanner.jsx',
  'apps/admin/src/App.jsx',
  'apps/admin/src/services/adminApi.js',
]) {
  scanBalance(relativePath)
}

if (warnings.length) {
  console.log('')
  console.log('Warnings:')
  for (const warning of warnings) {
    console.log(`WARN ${warning}`)
  }
}

if (failures.length) {
  console.log('')
  console.error('Phase 5 UX verify: FAILED')
  for (const failure of failures) {
    console.error(`FAIL ${failure}`)
  }
  process.exit(1)
}

console.log('')
console.log('Phase 5 UX verify: OK')
