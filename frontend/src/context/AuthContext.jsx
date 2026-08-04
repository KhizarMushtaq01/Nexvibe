import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authAPI, e2eAPI } from '../services/api';
import toast from 'react-hot-toast';
import { sodiumReady, generateIdentity, generateOneTimePreKeys } from '../lib/e2eCrypto';
import { getLocalIdentity, saveLocalIdentity, getUnusedOneTimePreKeys, saveOneTimePreKeys } from '../lib/e2eStorage';

const AuthContext = createContext(null);

async function ensureE2EKeys() {
  await sodiumReady();
  let identity = await getLocalIdentity();
  if (!identity) {
    identity = generateIdentity();
    await saveLocalIdentity(identity);
    const preKeys = generateOneTimePreKeys(20, 1);
    await saveOneTimePreKeys(preKeys);
    await e2eAPI.publishKeys({
      identityKey: identity.publicKey,
      oneTimePreKeys: preKeys.map(({ keyId, publicKey }) => ({ keyId, publicKey }))
    });
    return;
  }

  const unused = await getUnusedOneTimePreKeys();
  if (unused.length < 5) {
    const maxKeyId = unused.reduce((max, k) => Math.max(max, k.keyId), 0);
    const morePreKeys = generateOneTimePreKeys(20, maxKeyId + 1);
    await saveOneTimePreKeys(morePreKeys);
    await e2eAPI.publishKeys({
      identityKey: identity.publicKey,
      oneTimePreKeys: morePreKeys.map(({ keyId, publicKey }) => ({ keyId, publicKey }))
    });
  }
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
