import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const checker = path.join(scriptDir, 'check-production-env.mjs')
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dotwatch-phase-s1-'))

function serializeEnv(values) {
  return Object.entries(values)
    .map(([key, value]) => `${key}=${String(value).replaceAll('\n', '\\n')}`)
    .join('\n') + '\n'
}

function runCase(name, values, expectedExitCode, requiredText) {
  const file = path.join(tempDir, `${name}.env`)
  fs.writeFileSync(file, serializeEnv(values), 'utf8')

  const result = spawnSync(process.execPath, [checker, '--file', file], {
    encoding: 'utf8',
  })
  const output = `${result.stdout || ''}${result.stderr || ''}`
  const exitCode = result.status ?? 1

  if (exitCode !== expectedExitCode || !output.includes(requiredText)) {
    console.error(`FAIL: ${name}`)
    console.error(`Expected exit=${expectedExitCode} and text: ${requiredText}`)
    console.error(output.trim())
    return false
  }

  console.log(`PASS: ${name} (exit=${exitCode})`)
  for (const line of output.trim().split(/\r?\n/).filter(Boolean).slice(0, 5)) {
    console.log(`  ${line}`)
  }
  return true
}

const valid = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgres://dotwatch:example@private-db.example.internal:5432/dotwatch',
  DATABASE_SSL_DISABLED: 'false',
  DATABASE_SSL_REJECT_UNAUTHORIZED: 'true',
  CORS_ORIGIN: 'https://dashboard.example.com,https://admin.example.com',
  DEV_AUTH_BYPASS: 'false',
  FIREBASE_PROJECT_ID: 'dotwatch-production',
  FIREBASE_CLIENT_EMAIL: 'firebase-adminsdk@example.iam.gserviceaccount.com',
  FIREBASE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nTEST-ONLY\\n-----END PRIVATE KEY-----',
  DEVICE_SECRET_ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64'),
  DEVICE_WARNING_AFTER_SECONDS: '30',
  DEVICE_OFFLINE_AFTER_SECONDS: '60',
  DEVICE_STATUS_CHECK_SECONDS: '30',
  HEALTH_DB_TIMEOUT_MS: '3000',
}

const knownPublicKey = {
  ...valid,
  DEVICE_SECRET_ENCRYPTION_KEY: 'RameT7KiqYLV5vio0fsHKfxkQmh10+N+u4OAveuq5NI=',
}

const tlsVerificationDisabled = {
  ...valid,
  DATABASE_SSL_REJECT_UNAUTHORIZED: 'false',
}

let passed = true
passed = runCase(
  'secure-production-env',
  valid,
  0,
  'Production environment check passed.'
) && passed
passed = runCase(
  'known-public-encryption-key-is-blocked',
  knownPublicKey,
  1,
  'DEVICE_SECRET_ENCRYPTION_KEY must not be a placeholder or all-zero key'
) && passed
passed = runCase(
  'database-certificate-verification-is-required',
  tlsVerificationDisabled,
  1,
  'DATABASE_SSL_REJECT_UNAUTHORIZED must be true in production'
) && passed

fs.rmSync(tempDir, { recursive: true, force: true })

if (!passed) process.exit(1)
console.log('Phase S1 production environment pass/fail tests completed successfully.')
