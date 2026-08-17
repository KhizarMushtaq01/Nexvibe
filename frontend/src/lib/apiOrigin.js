// Where the backend lives, as an origin with no trailing slash ('' = same origin).
//
// Locally the dev server proxies /api and /socket.io to localhost:5000 (see
// vite.config.js), so same-origin relative requests are correct and this stays
// empty. A deployed frontend (Vercel) and the API (Render) are on different
// origins with no proxy in between, so VITE_API_URL points both HTTP and socket
// traffic straight at the backend. Cross-origin is already accounted for on the
// backend: its CORS allowlist includes the deployed frontend origin, and its
// auth cookies are SameSite=None; Secure in production.
export const normalizeApiOrigin = (value) =>
  typeof value === 'string' ? value.trim().replace(/\/+$/, '') : '';

export const API_ORIGIN = normalizeApiOrigin(import.meta.env.VITE_API_URL);
