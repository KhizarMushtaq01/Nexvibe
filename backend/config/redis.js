import { createClient } from 'redis';
import fs from 'fs';

// All connection details come from env vars -- nothing below should need a
// code change to point at a different Redis (local, managed, TLS or not).
const {
  REDIS_URL,
  REDIS_TLS,
  REDIS_TLS_CA,
  REDIS_TLS_REJECT_UNAUTHORIZED,
  REDIS_USERNAME,
  REDIS_PASSWORD
} = process.env;

const url = REDIS_URL || 'redis://localhost:6379';

// TLS turns on automatically for a `rediss://` URL; REDIS_TLS=true forces it
// for a plain `redis://` URL too (e.g. some managed providers still hand out
// a redis:// URL but expect TLS on the socket).
const wantsTLS = REDIS_TLS === 'true' || url.startsWith('rediss://');

const readCa = (value) => {
  if (!value) return undefined;
  try {
    return fs.existsSync(value) ? fs.readFileSync(value) : value;
  } catch {
    return value; // not a readable path -- treat as inline PEM content
  }
};

const rejectUnauthorized = REDIS_TLS_REJECT_UNAUTHORIZED !== 'false';
if (wantsTLS && !rejectUnauthorized) {
  console.warn('⚠️ REDIS_TLS_REJECT_UNAUTHORIZED=false -- Redis TLS certificate validation is DISABLED. Dev/self-signed use only, never in production.');
}

const redisClient = createClient({
  url,
  username: REDIS_USERNAME || undefined,
  password: REDIS_PASSWORD || undefined,
  socket: {
    ...(wantsTLS ? {
      tls: true,
      ca: readCa(REDIS_TLS_CA),
      rejectUnauthorized
    } : {}),
    // Keep retrying forever with a capped backoff instead of giving up --
    // Redis being down is not fatal here, the rate limiters below fall back
    // to an in-process MemoryStore while disconnected (see
    // middleware/rateLimiters.js) and switch back the moment this client
    // reports 'ready' again.
    reconnectStrategy: (retries) => Math.min(retries * 200, 5000)
  }
});

redisClient.on('error', (err) => console.error('❌ Redis Client Error:', err.code || err.message || err));
redisClient.on('ready', () => console.log('🔴 Redis connected -- rate limiters using the shared Redis store'));
redisClient.on('end', () => console.warn('⚠️ Redis connection lost -- rate limiters falling back to in-memory (per-instance) limits'));

let connectPromise = null;

// Best-effort, time-boxed: gives Redis up to CONNECT_TIMEOUT_MS to come up
// so a healthy Redis is used from request one, but never blocks server
// startup longer than that. Note redisClient.connect()'s own promise does
// NOT settle on a failed attempt while reconnectStrategy keeps retrying (it
// only resolves once truly connected) -- so this is raced against a timer
// rather than awaited directly, otherwise a down Redis would hang startup
// forever. The underlying client keeps retrying in the background either
// way; middleware/rateLimiters.js's FallbackStore checks redisClient.isReady
// per-request and degrades to an in-process MemoryStore until it flips true.
const CONNECT_TIMEOUT_MS = 5000;

export const connectRedis = () => {
  if (!connectPromise) {
    // Attach a .catch() immediately so this never becomes an unhandled
    // rejection once the race below stops waiting on it.
    const attempt = redisClient.connect().catch((error) => {
      console.error(`❌ Redis connection error: ${error.code || error.message}`);
    });
    const timeout = new Promise((resolve) => setTimeout(resolve, CONNECT_TIMEOUT_MS));
    connectPromise = Promise.race([attempt, timeout]).then(() => {
      if (!redisClient.isReady) {
        console.warn(`⚠️ Redis not ready after ${CONNECT_TIMEOUT_MS}ms, starting with in-memory rate limiting (will switch to Redis automatically once it connects)`);
      }
    });
  }
  return connectPromise;
};

export default redisClient;
