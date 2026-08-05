import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authAPI, e2eAPI } from '../services/api';
import toast from 'react-hot-toast';
import { sodiumReady, generateIdentity, generateOneTimePreKeys } from '../lib/e2eCrypto';
import { getLocalIdentity, saveLocalIdentity, getUnusedOneTimePreKeys, saveOneTimePreKeys } from '../lib/e2eStorage';

const AuthContext = createContext(null);

const PREKEY_BATCH = 20;
const PREKEY_LOW_WATER = 5;

// Concurrent callers (React StrictMode's intentional double-invoke of mount
// effects in dev, two tabs opened at once, or fetchMe firing again before a
// prior run finished) must never race two independent runs of this function.
// The "no local identity yet" branch below has no atomicity: two overlapping
// runs would each generate a DIFFERENT random identity, save it to IndexedDB
// (last write wins locally), and POST it to the server (last request wins
// there too) -- and those two "last writes" are decided by unrelated async
// races (disk vs. network), so they can disagree. The result is a client
// that locally holds a private identity key that doesn't match the public
// key it told the server about, which silently and permanently breaks
// decryption for every message anyone sends it using that bundle. Dedupe
// concurrent calls onto a single in-flight run to make this function
// effectively atomic per page load.
let ensureE2EKeysInFlight = null;

function ensureE2EKeys() {
  if (!ensureE2EKeysInFlight) {
    ensureE2EKeysInFlight = runEnsureE2EKeys().finally(() => {
      ensureE2EKeysInFlight = null;
    });
  }
  return ensureE2EKeysInFlight;
}

async function runEnsureE2EKeys() {
  await sodiumReady();
  let identity = await getLocalIdentity();
  if (!identity) {
    identity = generateIdentity();
    await saveLocalIdentity(identity);
    const preKeys = generateOneTimePreKeys(PREKEY_BATCH, 1);
    await saveOneTimePreKeys(preKeys);
    await e2eAPI.publishKeys({
      identityKey: identity.publicKey,
      oneTimePreKeys: preKeys.map(({ keyId, publicKey }) => ({ keyId, publicKey }))
    });
    return;
  }

  const unused = await getUnusedOneTimePreKeys();

  // The local count is NOT a reliable proxy for the server-side pool: the
  // server marks a prekey used as soon as a bundle is SERVED, while this
  // device only deletes its private half when a handshake naming that keyId
  // actually arrives. Sends that were fetched-but-never-delivered, or peers who
  // never open the thread, drain the server pool with no local counterpart --
  // and once it hits zero every new handshake toward us silently downgrades to
  // the unauthenticated no-prekey fallback. So ask the server what it has left.
  let server = null;
  try {
    const { data } = await e2eAPI.getKeyStatus();
    if (typeof data?.remaining === 'number') server = data;
  } catch { /* offline / older server: fall back to the local count alone */ }

  const serverLow = server ? server.remaining < PREKEY_LOW_WATER : false;
  if (unused.length >= PREKEY_LOW_WATER && !serverLow) return;

  // Start above BOTH the local and the server-known highest keyId so a new
  // batch can never collide with a keyId the server still holds.
  const localMaxKeyId = unused.reduce((max, k) => Math.max(max, k.keyId), 0);
  const startKeyId = Math.max(localMaxKeyId, server?.maxKeyId || 0) + 1;
  const morePreKeys = generateOneTimePreKeys(PREKEY_BATCH, startKeyId);
  await saveOneTimePreKeys(morePreKeys);
  await e2eAPI.publishKeys({
    identityKey: identity.publicKey,
    oneTimePreKeys: morePreKeys.map(({ keyId, publicKey }) => ({ keyId, publicKey }))
  });
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(localStorage.getItem('token'));

  const fetchMe = useCallback(async () => {
    try {
      const { data } = await authAPI.getMe();
      setUser(data.user);
      ensureE2EKeys().catch(err => console.error('E2E key setup failed:', err));
    } catch {
      setUser(null);
      localStorage.removeItem('token');
      setToken(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token) fetchMe();
    else setLoading(false);
  }, [token, fetchMe]);

  const login = async (identifier, password) => {
    const { data } = await authAPI.login({ identifier, password });
    if (data.token) {
      localStorage.setItem('token', data.token);
      setToken(data.token);
      setUser(data.user);
      ensureE2EKeys().catch(err => console.error('E2E key setup failed:', err));
    }
    return data;
  };

  const register = async (formData) => {
    const { data } = await authAPI.register(formData);
    return data;
  };

  const logout = async () => {
    try { await authAPI.logout(); } catch {}
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  };

  const updateUser = (updates) => {
    setUser(prev => prev ? { ...prev, ...updates } : null);
  };

  const oauthLogin = async (provider, providerData) => {
    const { data } = await authAPI.oauthLogin({ provider, ...providerData });
    if (data.token) {
      localStorage.setItem('token', data.token);
      setToken(data.token);
      setUser(data.user);
      ensureE2EKeys().catch(err => console.error('E2E key setup failed:', err));
    }
    return data;
  };

  return (
    <AuthContext.Provider value={{ user, loading, token, login, register, logout, updateUser, oauthLogin, fetchMe }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
