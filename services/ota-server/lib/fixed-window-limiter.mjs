export class FixedWindowLimiter {
  constructor({ windowMs, limit, maxEntries = 10_000 }) {
    if (!Number.isInteger(windowMs) || windowMs <= 0) {
      throw new Error("windowMs must be a positive integer");
    }
    if (!Number.isInteger(limit) || limit <= 0) {
      throw new Error("limit must be a positive integer");
    }
    if (!Number.isInteger(maxEntries) || maxEntries <= 0) {
      throw new Error("maxEntries must be a positive integer");
    }

    this.windowMs = windowMs;
    this.limit = limit;
    this.maxEntries = maxEntries;
    this.entries = new Map();
  }

  cleanupExpired(now = Date.now(), scanLimit = 128) {
    let scanned = 0;
    for (const [key, state] of this.entries.entries()) {
      if (scanned >= scanLimit) break;
      scanned += 1;
      if (state.resetAt <= now) this.entries.delete(key);
    }
  }

  trimToMaxEntries() {
    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) break;
      this.entries.delete(oldestKey);
    }
  }

  getState(key, now = Date.now()) {
    const normalizedKey = String(key || "unknown");
    let state = this.entries.get(normalizedKey);
    if (!state || state.resetAt <= now) {
      state = { count: 0, resetAt: now + this.windowMs };
      this.entries.delete(normalizedKey);
      this.entries.set(normalizedKey, state);
      this.trimToMaxEntries();
    }
    return { normalizedKey, state };
  }

  check(key, now = Date.now()) {
    this.cleanupExpired(now);
    const { state } = this.getState(key, now);
    const allowed = state.count < this.limit;
    return {
      allowed,
      count: state.count,
      remaining: Math.max(0, this.limit - state.count),
      resetAt: state.resetAt,
      retryAfterMs: allowed ? 0 : Math.max(1, state.resetAt - now)
    };
  }

  consume(key, now = Date.now()) {
    this.cleanupExpired(now);
    const { normalizedKey, state } = this.getState(key, now);
    state.count += 1;
    this.entries.delete(normalizedKey);
    this.entries.set(normalizedKey, state);

    this.trimToMaxEntries();

    const allowed = state.count <= this.limit;
    return {
      allowed,
      count: state.count,
      remaining: Math.max(0, this.limit - state.count),
      resetAt: state.resetAt,
      retryAfterMs: allowed ? 0 : Math.max(1, state.resetAt - now)
    };
  }

  get size() {
    return this.entries.size;
  }
}
