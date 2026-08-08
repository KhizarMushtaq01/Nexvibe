import GeoRestriction from '../models/GeoRestriction.js';

let cache = null; // { mode: string, countries: Set<string> } | null
let cachedAt = 0;
const CACHE_TTL_MS = 60 * 1000;

// Loads the singleton settings document into an in-memory cache (creating
// the default allow_all document on first-ever access), so the geoBlock
// middleware doesn't hit the DB on every single request. A 60s TTL is used
// in addition to (not instead of) invalidateCache(): under horizontal
// scaling, invalidateCache() only clears the cache in the one process that
// handled the admin's save, so other instances would otherwise keep serving
// stale settings indefinitely. The TTL makes every instance self-heal
// within a minute even if the explicit invalidation never reaches it.
export const getSettings = async () => {
  if (cache && Date.now() - cachedAt < CACHE_TTL_MS) return cache;
  let doc = await GeoRestriction.findOne();
  if (!doc) {
    doc = await GeoRestriction.create({ mode: 'allow_all', countries: [] });
  }
  cache = { mode: doc.mode, countries: new Set(doc.countries) };
  cachedAt = Date.now();
  return cache;
};

// Called by the admin PUT handler right after saving, so the very next
// request picks up the new settings instead of waiting for the process to
// restart (same-instance immediate-update case; other instances self-heal
// via the TTL above).
export const invalidateCache = () => {
  cache = null;
  cachedAt = 0;
};

// Pure function -- takes mode/countries explicitly rather than re-reading
// the cache itself, so it's trivially testable in isolation.
export const isCountryAllowed = (countryCode, mode, countries) => {
  if (mode === 'allow_all') return true;
  if (!countryCode) return true; // geoip miss -- fail open, never block on an unknown IP
  if (mode === 'whitelist') return countries.has(countryCode);
  if (mode === 'blacklist') return !countries.has(countryCode);
  return true;
};
