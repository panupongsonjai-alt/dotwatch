import assert from 'node:assert/strict'

import { FixedWindowLimiter as BackendLimiter } from '../services/backend/src/security/fixedWindowLimiter.js'
import { FixedWindowLimiter as OtaLimiter } from '../services/ota-server/lib/fixed-window-limiter.mjs'

function exerciseLimiter(Limiter, label) {
  const limiter = new Limiter({ windowMs: 1000, limit: 2, maxEntries: 2 })

  assert.equal(limiter.check('a', 0).allowed, true)
  assert.equal(limiter.consume('a', 0).allowed, true)
  assert.equal(limiter.consume('a', 100).allowed, true)

  const blocked = limiter.consume('a', 200)
  assert.equal(blocked.allowed, false)
  assert.equal(blocked.retryAfterMs, 800)
  assert.equal(limiter.check('a', 300).allowed, false)

  assert.equal(limiter.consume('a', 1000).allowed, true)
  assert.equal(limiter.consume('b', 1000).allowed, true)
  assert.equal(limiter.consume('c', 1000).allowed, true)
  assert.ok(limiter.size <= 2)

  console.log(`PASS: ${label} fixed-window limiter`)
}

exerciseLimiter(BackendLimiter, 'backend')
exerciseLimiter(OtaLimiter, 'OTA')

console.log('Phase S2 limiter tests passed.')
