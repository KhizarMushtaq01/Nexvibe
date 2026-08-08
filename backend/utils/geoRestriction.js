import GeoRestriction from '../models/GeoRestriction.js';

let cache = null; // { mode: string, countries: Set<string> } | null

// Loads the singleton settings document into an in-memory cache (creating
// the default allow_all document on first-ever access), so the geoBlock
// middleware doesn't hit the DB on every single request.
export const getSettings = async () => {
  if (cache) return cache;
  let doc = await GeoRestriction.findOne();
  if (!doc) {
    doc = await GeoRestriction.create({ mode: 'allow_all', countries: [] });
  }
  cache = { mode: doc.mode, countries: new Set(doc.countries) };
  return cache;
};

// Called by the admin PUT handler right after saving, so the very next
// request picks up the new settings instead of waiting for the process to
// restart.
export const invalidateCache = () => {
  cache = null;
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
