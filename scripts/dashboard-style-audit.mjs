import fs from 'node:fs'
import path from 'node:path'

const rootDir = process.cwd()
const dashboardSrcDir = path.join(rootDir, 'apps', 'dashboard', 'src')
const stylesEntry = path.join(dashboardSrcDir, 'styles.css')
const uiPreferences = path.join(dashboardSrcDir, 'utils', 'uiPreferences.js')
const phase3Css = path.join(dashboardSrcDir, 'styles', 'phase3-ui-stabilizer.css')
const settingsPage = path.join(dashboardSrcDir, 'pages', 'Settings.jsx')
const appFile = path.join(dashboardSrcDir, 'App.jsx')

const requiredFiles = [stylesEntry, uiPreferences, phase3Css, settingsPage, appFile]
const errors = []
const warnings = []

function readFile(filePath) {
  return fs.readFileSync(filePath, 'utf8')
}

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) {
    errors.push(`Missing required file: ${path.relative(rootDir, file)}`)
  }
}

if (errors.length === 0) {
  const stylesEntryText = readFile(stylesEntry)
  const settingsText = readFile(settingsPage)
  const appText = readFile(appFile)
  const phase3CssText = readFile(phase3Css)
  const uiPreferencesText = readFile(uiPreferences)

  if (!stylesEntryText.includes("@import './styles/phase3-ui-stabilizer.css';")) {
    errors.push('styles.css must import phase3-ui-stabilizer.css as the final dashboard stabilization layer.')
  }

  if (!settingsText.includes("from '../utils/uiPreferences'")) {
    errors.push('Settings.jsx must use the shared uiPreferences utility instead of duplicate preference constants.')
  }

  if (!appText.includes("from './utils/uiPreferences'")) {
    errors.push('App.jsx must apply UI preferences through the shared uiPreferences utility.')
  }

  for (const selector of [
    ':root[data-density=\'compact\']',
    ':root[data-density=\'spacious\']',
    ':root[data-compact-cards=\'true\']',
    '.dashboard-map-card-v2',
    '.dw-page-header',
  ]) {
    if (!phase3CssText.includes(selector)) {
      errors.push(`phase3-ui-stabilizer.css is missing selector/token: ${selector}`)
    }
  }

  for (const exportName of [
    'ACCENT_OPTIONS',
    'DENSITY_OPTIONS',
    'readUiPreferences',
    'writeUiPreferences',
    'applyUiPreferences',
    'broadcastUiPreferencesChanged',
  ]) {
    if (!uiPreferencesText.includes(`export ${exportName}`) && !uiPreferencesText.includes(`export function ${exportName}`) && !uiPreferencesText.includes(`export const ${exportName}`)) {
      errors.push(`uiPreferences.js must export ${exportName}.`)
    }
  }

  const cssPatchFiles = fs
    .readdirSync(path.join(dashboardSrcDir, 'styles'))
    .filter((file) => /fix|patch|stabilizer|unify|final|guard/i.test(file))

  if (cssPatchFiles.length > 16) {
    warnings.push(
      `Dashboard still has ${cssPatchFiles.length} patch-style CSS files. Phase 3 adds a final stabilizer, but later cleanup should merge old patches gradually.`
    )
  }
}

if (warnings.length > 0) {
  console.log('Dashboard style audit warnings:')
  for (const warning of warnings) {
    console.log(`- ${warning}`)
  }
  console.log('')
}

if (errors.length > 0) {
  console.error('Dashboard style audit failed:')
  for (const error of errors) {
    console.error(`- ${error}`)
  }
  process.exit(1)
}

console.log('Dashboard style audit passed.')
