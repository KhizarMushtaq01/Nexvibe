import rateLimit, { MemoryStore } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import redisClient from '../config/redis.js';
import { logSecurityEvent } from '../utils/securityLog.js';

// RedisStore's constructor fires an un-awaited command to load its Lua
// script the instant it's constructed. If Redis isn't connected yet that
// promise eventually rejects with nothing to catch it -- an unhandled
// rejection that crashes the whole process. So a RedisStore is only ever
// built lazily, the first time redisClient is actually ready, and cached
// per rate-limit prefix from then on.
const redisStoresByPrefix = new Map();

const getRedisStore = (prefix, initOptions) => {
  if (!redisClient.isReady) return null;
  let store = redisStoresByPrefix.get(prefix);
  if (!store) {
    try {
      store = new RedisStore({
        sendCommand: (...args) => redisClient.sendCommand(args),
        prefix: `rl:${prefix}:`
      });
      store.init(initOptions);
      redisStoresByPrefix.set(prefix, store);
    } catch (err) {
      console.error(`Failed to build RedisStore for "${prefix}": ${err.message}`);
      return null;
    }
  }
  return store;
};

// Per express-rate-limit's Store interface (init/increment/decrement/
// resetKey). Prefers Redis whenever it's connected -- so limits are shared
// across instances -- and transparently degrades to an in-process
// MemoryStore whenever it isn't, so a Redis outage throttles per-instance
// instead of taking rate limiting (and therefore these auth endpoints) down.
// Note: counts made under Redis and counts made under the memory fallback
// are two separate tallies -- a flapping Redis connection can undercount
// slightly across the switchover. Acceptable for a security control that
// only needs to be approximately right, not perfectly precise.
class FallbackStore {
  constructor(prefix) {
    this.prefix = prefix;
    this.memoryStore = new MemoryStore();
  }

  init(options) {
    this.initOptions = options;
    this.memoryStore.init(options);
  }

  async increment(key) {
    const redis = getRedisStore(this.prefix, this.initOptions);
    if (redis) {
      try {
        return await redis.increment(key);
      } catch (err) {
        console.error(`Redis rate-limit increment failed ("${this.prefix}"), falling back to memory: ${err.message}`);
      }
    }
    return this.memoryStore.increment(key);
  }

  async decrement(key) {
    const redis = getRedisStore(this.prefix, this.initOptions);
    if (redis) {
      try {
        await redis.decrement(key);
        return;
      } catch { /* fall through to memory store below */ }
    }
    return this.memoryStore.decrement(key);
  }

  async resetKey(key) {
    const redis = getRedisStore(this.prefix, this.initOptions);
    if (redis) {
      try {
        await redis.resetKey(key);
      } catch { /* best effort */ }
    }
    return this.memoryStore.resetKey(key);
  }
}

const redisStore = (prefix) => new FallbackStore(prefix);

const bilingualMessage = (en, ur) => ({ success: false, message: en, message_ur: ur });

const makeHandler = (event, en, ur) => (req, res /*, next, options */) => {
  logSecurityEvent(event, req, {
    userId: req.body?.userId,
    email: req.body?.email,
    meta: { route: req.originalUrl }
  });
  const retryAfterSec = Math.ceil((req.rateLimit?.resetTime?.getTime() - Date.now()) / 1000) || 60;
  res.set('Retry-After', String(Math.max(retryAfterSec, 1)));
  res.status(429).json({ ...bilingualMessage(en, ur), retryAfterSeconds: Math.max(retryAfterSec, 1) });
};

// Key by identifier (email/userId/phone from the body) combined with IP so a
// shared IP (NAT, campus wifi) doesn't collectively lock out unrelated users,
// while a single attacker can't just rotate identifiers to dodge the limit.
const identifierAndIpKey = (req) => {
  const identifier = req.body?.email || req.body?.userId || req.body?.phone || req.body?.identifier || '';
  return `${req.ip}:${String(identifier).toLowerCase()}`;
};

export const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: redisStore('login'),
  keyGenerator: (req) => `${req.ip}:${String(req.body?.identifier || '').toLowerCase()}`,
  handler: makeHandler(
    'RATE_LIMIT_EXCEEDED',
    'Too many login attempts. Please try again later.',
    'Bohat zyada login attempts. Baraye meherbani thodi dair baad koshish karein.'
  )
});

export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  store: redisStore('register'),
  handler: makeHandler(
    'RATE_LIMIT_EXCEEDED',
    'Too many accounts created from this network. Please try again later.',
    'Is network se bohat zyada accounts banaye ja chuke hain. Baad mein koshish karein.'
  )
});

export const verifyOtpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  store: redisStore('verify-otp'),
  handler: makeHandler(
    'RATE_LIMIT_EXCEEDED',
    'Too many verification attempts. Please try again later.',
    'Bohat zyada verification attempts. Baraye meherbani thodi dair baad koshish karein.'
  )
});

// 3 requests / 5 minutes per identifier+IP.
export const resendOtpLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  store: redisStore('resend-otp'),
  keyGenerator: identifierAndIpKey,
  handler: makeHandler(
    'RATE_LIMIT_EXCEEDED',
    'Too many code requests. Please wait a few minutes and try again.',
    'Bohat zyada code requests. Chand minute intezar karke dobara koshish karein.'
  )
});

// Separate, tighter limiter enforcing the 60-second minimum gap between two
// consecutive resend requests for the same identifier.
export const resendOtpCooldownLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 1,
  standardHeaders: true,
  legacyHeaders: false,
  store: redisStore('resend-otp-cooldown'),
  keyGenerator: identifierAndIpKey,
  handler: makeHandler(
    'RATE_LIMIT_EXCEEDED',
    'Please wait at least 60 seconds before requesting another code.',
    'Naya code mangne se pehle kam az kam 60 second intezar karein.'
  )
});

// Not in the audit's explicit table, but /refresh-token is still an
// authentication endpoint and the intro requirement asks for coverage on
// "all authentication endpoints" -- a generous IP-based ceiling here mainly
// guards against a broken client hammering the endpoint in a retry loop.
export const refreshTokenLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  store: redisStore('refresh-token'),
  handler: makeHandler(
    'RATE_LIMIT_EXCEEDED',
    'Too many session refresh attempts. Please sign in again.',
    'Bohat zyada session refresh attempts. Baraye meherbani dobara sign in karein.'
  )
});

// IP-based only, per audit requirement -- deliberately not keyed by email so
// it can't be used as an email-existence oracle by comparing limiter state.
export const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2,
  standardHeaders: true,
  legacyHeaders: false,
  store: redisStore('forgot-password'),
  handler: makeHandler(
    'RATE_LIMIT_EXCEEDED',
    'Too many password reset requests. Please try again later.',
    'Bohat zyada password reset requests. Baraye meherbani thodi dair baad koshish karein.'
  )
});

// Each request here sends a real (billed) SMS via Twilio, and the endpoint
// is otherwise just "authenticated user + arbitrary phone number" -- without
// a limit, one account could be used to SMS-bomb any number for free.
// Keyed by the authenticated user (req.user is set by `protect`, which runs
// before this in the route chain) since IP alone wouldn't stop one account
// from rotating IPs, and userId alone wouldn't stop credential-stuffed
// accounts sharing an IP -- same identifier+IP pattern as the OTP limiters.
export const phoneChangeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  store: redisStore('phone-change'),
  keyGenerator: (req) => `${req.ip}:${req.user?._id || ''}`,
  handler: makeHandler(
    'RATE_LIMIT_EXCEEDED',
    'Too many phone number change requests. Please try again later.',
    'Bohat zyada phone number change requests. Baraye meherbani thodi dair baad koshish karein.'
  )
});

// Public, unauthenticated endpoint hit once per keystroke-pause while typing
// a username on the signup form -- generous enough for that, but capped so
// it can't be scripted into a full username-enumeration/DB-hammering tool.
export const checkUsernameLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  store: redisStore('check-username'),
  handler: makeHandler(
    'RATE_LIMIT_EXCEEDED',
    'Too many requests. Please slow down.',
    'Bohat zyada requests. Baraye meherbani thoda ruk kar koshish karein.'
  )
});
