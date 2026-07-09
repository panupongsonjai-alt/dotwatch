import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()

const requiredFiles = [
  'apps/dashboard/src/services/firebase.js',
  'apps/dashboard/src/pages/Login.jsx',
  'apps/dashboard/src/styles/phase10e-dashboard-auth-env.css',
  'apps/dashboard/.env.local.example',
  'docs/PHASE10E_DASHBOARD_AUTH_ENV.md',
]

const requiredMarkers = [
  ['apps/dashboard/src/services/firebase.js', 'missingFirebaseEnvNames'],
  ['apps/dashboard/src/services/firebase.js', 'firebaseConfigHelp'],
  ['apps/dashboard/src/pages/Login.jsx', 'auth-config-warning'],
  ['apps/dashboard/src/pages/Login.jsx', 'isFirebaseConfigured'],
  ['apps/dashboard/src/styles.css', "phase10e-dashboard-auth-env.css"],
  ['apps/dashboard/.env.local.example', 'VITE_FIREBASE_API_KEY='],
  ['apps/dashboard/.env.local.example', 'VITE_FIREBASE_AUTH_DOMAIN='],
  ['apps/dashboard/.env.local.example', 'VITE_FIREBASE_PROJECT_ID='],
  ['apps/dashboard/.env.local.example', 'VITE_FIREBASE_APP_ID='],
]

let failed = false

for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(root, file))) {
    console.error(`[MISSING] ${file}`)
    failed = true
  }
}

for (const [file, marker] of requiredMarkers) {
  const fullPath = path.join(root, file)
  const content = fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : ''

  if (!content.includes(marker)) {
    console.error(`[MISSING MARKER] ${file}: ${marker}`)
    failed = true
  }
}

const loginContent = fs.readFileSync(path.join(root, 'apps/dashboard/src/pages/Login.jsx'), 'utf8')
const hasActionableError = loginContent.includes('apps/dashboard/.env.local')

if (!hasActionableError) {
  console.error('[MISSING] Login page actionable env error')
  failed = true
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))

if (!packageJson.scripts?.['verify:phase10e:dashboard-auth']) {
  console.error('[MISSING] package.json script verify:phase10e:dashboard-auth')
  failed = true
}

if (failed) {
  process.exit(1)
}

console.log('Phase 10E Dashboard Auth Env verify: OK')
