import { useState, useEffect, useRef } from 'react';
import { FiEye, FiEyeOff, FiSun, FiMoon, FiCheck, FiX } from 'react-icons/fi';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import { FcGoogle } from 'react-icons/fc';
import { FaFacebook, FaApple } from 'react-icons/fa6';
import { FaXTwitter } from "react-icons/fa6";
import { useTheme } from '../../context/ThemeContext';
import { authAPI } from '../../services/api';

import { triggerGoogleLogin } from '../../lib/googleAuth';
import { triggerFacebookLogin } from '../../lib/facebookAuth';
import { triggerAppleLogin } from '../../lib/appleAuth';

const USERNAME_PATTERN = /^[a-zA-Z0-9._]+$/;

// Turns "Khizar Mushtaq" into "khizarmushtaq" -- strips accents, anything
// that isn't a letter/digit, and caps the length so a couple of suffix
// digits still fit under the 30-char backend limit.
const COMBINING_DIACRITICS = new RegExp('[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + ']', 'g');

const slugifyName = (name) => name
  .normalize('NFKD').replace(COMBINING_DIACRITICS, '')
  .toLowerCase()
  .replace(/[^a-z0-9]/g, '')
  .slice(0, 15);

// A few 2-digit suffixes first (matches "2 ya 3 digits"), then 3-digit ones
// as a fallback if the base name is common enough that those collide too.
const buildUsernameCandidates = (base) => {
  const candidates = [];
  for (let i = 0; i < 4; i++) candidates.push(base + String(Math.floor(10 + Math.random() * 90)));
  for (let i = 0; i < 3; i++) candidates.push(base + String(Math.floor(100 + Math.random() * 900)));
  return candidates;
};

export default function RegisterPage() {
  const { register, oauthLogin } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ fullName: '', username: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [errors, setErrors] = useState({});
  // 'idle' | 'checking' | 'available' | 'taken'
  const [usernameStatus, setUsernameStatus] = useState('idle');
  const usernameCheckSeq = useRef(0);
  // Once the user types into the username field themselves, the auto-suggest
  // effect below backs off for good -- "agar user change krna chahe to
  // change krne dena".
  const [usernameManuallyEdited, setUsernameManuallyEdited] = useState(false);
  const suggestSeq = useRef(0);

  // Suggests a username from the name once both it and the email/phone
  // field have something in them, trying a few "name" + 2-3 random digits
  // candidates until one is actually free.
  useEffect(() => {
    if (usernameManuallyEdited) return;
    const base = slugifyName(form.fullName);
    if (base.length < 2 || !form.email.trim()) return;

    const seq = ++suggestSeq.current;
    const timer = setTimeout(async () => {
      for (const candidate of buildUsernameCandidates(base)) {
        if (seq !== suggestSeq.current || usernameManuallyEdited) return;
        try {
          const { data } = await authAPI.checkUsername(candidate);
          if (data.available) {
            if (seq === suggestSeq.current && !usernameManuallyEdited) {
              setForm(p => ({ ...p, username: candidate }));
            }
            return;
          }
        } catch {
          return; // network hiccup -- leave the field as-is, not worth retrying here
        }
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [form.fullName, form.email, usernameManuallyEdited]);

  useEffect(() => {
    const username = form.username.trim();
    if (username.length < 3 || !USERNAME_PATTERN.test(username)) {
      setUsernameStatus('idle');
      return;
    }
    setUsernameStatus('checking');
    const seq = ++usernameCheckSeq.current;
    const timer = setTimeout(async () => {
      try {
        const { data } = await authAPI.checkUsername(username);
        // Ignore a stale response that resolves after a newer keystroke's
        // check already started -- otherwise a slow early request could
        // overwrite the status a later, faster one already set.
        if (seq === usernameCheckSeq.current) {
          setUsernameStatus(data.available ? 'available' : 'taken');
        }
      } catch {
        if (seq === usernameCheckSeq.current) setUsernameStatus('idle');
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [form.username]);

  const validate = () => {
    const e = {};
    if (!form.fullName.trim()) e.fullName = 'Full name required';
    if (!form.username.trim()) e.username = 'Username required';
    else if (form.username.length < 3) e.username = 'Min 3 characters';
    else if (!USERNAME_PATTERN.test(form.username)) e.username = 'Letters, numbers, dots, underscores only';
    else if (usernameStatus === 'taken') e.username = 'Username already taken';
    if (!form.email) e.email = 'Email or phone number required';
    else if (form.email.includes('@')) {
      if (!/\S+@\S+\.\S+/.test(form.email)) e.email = 'Invalid email';
    } else if (!/^\+?[0-9\s-]{7,15}$/.test(form.email)) {
      e.email = 'Invalid phone number';
    }
    if (!form.password) e.password = 'Password required';
    else if (form.password.length < 8) e.password = 'Min 8 characters';
    else if (!/[A-Z]/.test(form.password)) e.password = 'Add an uppercase letter';
    else if (!/[a-z]/.test(form.password)) e.password = 'Add a lowercase letter';
    else if (!/[0-9]/.test(form.password)) e.password = 'Add a number';
    else if (!/[^A-Za-z0-9]/.test(form.password)) e.password = 'Add a special character';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const isEmail = form.email.includes('@');
      const payload = {
        fullName: form.fullName,
        username: form.username,
        password: form.password,
        ...(isEmail ? { email: form.email } : { phone: form.email }),
      };
      const data = await register(payload);
      toast.success(isEmail ? 'Account created! Please verify your email.' : 'Account created! Please verify your phone number.');
      navigate('/otp', {
        state: {
          userId: data.userId,
          purpose: 'register',
          email: isEmail ? form.email : undefined,
          phone: isEmail ? undefined : form.email,
        }
      });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Registration failed');
    } finally { setLoading(false); }
  };

  const strength = (() => {
    const p = form.password;
    if (!p) return 0;
    let s = 0;
    if (p.length >= 8) s++;
    if (/[A-Z]/.test(p)) s++;
    if (/[0-9]/.test(p)) s++;
    if (/[^A-Za-z0-9]/.test(p)) s++;
    return s;
  })();

  const strengthColors = ['bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-green-500'];
  const strengthLabels = ['Weak', 'Fair', 'Good', 'Strong'];

  const oauthProviders = [
    { icon: <FcGoogle className="w-5 h-5" />, label: 'Continue with Google', provider: 'google' },
    { icon: <FaFacebook className="w-5 h-5 text-[#1877F2]" />, label: 'Continue with Facebook', provider: 'facebook' },
    { icon: <FaApple className="w-5 h-5" />, label: 'Continue with Apple', provider: 'apple' },
    { icon: <FaXTwitter className="w-5 h-5" />, label: 'Continue with X', provider: 'twitter' },
  ];

  const handleOAuth = async (provider) => {
    if (provider === 'google') {
      try {
        const accessToken = await triggerGoogleLogin();
        const data = await oauthLogin(provider, { token: accessToken });
        if (data.requiresTwoFactor) {
          navigate('/otp', { state: { userId: data.userId, purpose: '2fa' } });
          return;
        }
        toast.success('Welcome to NexVibe!');
        navigate('/');
      } catch (err) {
        toast.error(err.response?.data?.message || err.message || 'Google sign-in failed');
      }
      return;
    }
    if (provider === 'facebook') {
      try {
        const accessToken = await triggerFacebookLogin();
        const data = await oauthLogin(provider, { token: accessToken });
        if (data.requiresTwoFactor) {
          navigate('/otp', { state: { userId: data.userId, purpose: '2fa' } });
          return;
        }
        toast.success('Welcome to NexVibe!');
        navigate('/');
      } catch (err) {
        toast.error(err.response?.data?.message || err.message || 'Facebook sign-in failed');
      }
      return;
    }
    if (provider === 'apple') {
      try {
        const { idToken, fullName } = await triggerAppleLogin();
        const data = await oauthLogin(provider, { token: idToken, fullName });
        if (data.requiresTwoFactor) {
          navigate('/otp', { state: { userId: data.userId, purpose: '2fa' } });
          return;
        }
        toast.success('Welcome to NexVibe!');
        navigate('/');
      } catch (err) {
        toast.error(err.response?.data?.message || err.message || 'Apple sign-in failed');
      }
      return;
    }
    toast('OAuth requires backend configuration', { icon: 'ℹ️' });
  };

  return (
    <div className="min-h-screen bg-[var(--bg-secondary)] flex items-center justify-center p-4">
      <button onClick={toggleTheme} className="fixed top-4 right-4 p-2 rounded-full hover:bg-[var(--bg-tertiary)] transition-colors text-[var(--text-secondary)]">
        {isDark ? <FiSun className="w-4 h-4" /> : <FiMoon className="w-4 h-4" />}
      </button>

      <div className="w-full max-w-[350px]">
        <div className="card p-8 mb-3 animate-fade-in">
          <div className="text-center mb-6">
            <h1 className="text-4xl font-black text-gradient mb-1">NexVibe</h1>
            <p className="text-sm text-[var(--text-secondary)] font-semibold leading-tight">
              Sign up to see photos and videos from your friends.
            </p>
          </div>

          {/* OAuth buttons */}
          <div className="space-y-2 mb-4">
            {oauthProviders.map(({ icon, label, provider }) => (
              <button key={provider} onClick={() => handleOAuth(provider)}
                className="w-full flex items-center gap-3 px-4 py-2 border border-[var(--border)] rounded-lg hover:bg-[var(--bg-tertiary)] transition-all text-sm font-medium">
                {icon} {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-[var(--border)]" />
            <span className="text-xs text-[var(--text-muted)] font-medium">OR</span>
            <div className="flex-1 h-px bg-[var(--border)]" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <input type="text" placeholder="Full Name" value={form.fullName}
                onChange={e => setForm(p => ({ ...p, fullName: e.target.value }))}
                className={`input-field ${errors.fullName ? 'border-red-400' : ''}`} />
              {errors.fullName && <p className="text-xs text-red-500 mt-1">{errors.fullName}</p>}
            </div>
            <div>
              <input type="text" placeholder="Email or phone number" value={form.email}
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                className={`input-field ${errors.email ? 'border-red-400' : ''}`} />
              {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
            </div>
            <div>
              <div className="relative">
                <input type="text" placeholder="Username" value={form.username}
                  onChange={e => {
                    setUsernameManuallyEdited(true);
                    setForm(p => ({ ...p, username: e.target.value.toLowerCase() }));
                  }}
                  className={`input-field pr-8 ${errors.username ? 'border-red-400' : ''}`} />
                {usernameStatus === 'checking' && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-[var(--text-muted)] border-t-transparent rounded-full animate-spin" />
                )}
                {usernameStatus === 'available' && !errors.username && (
                  <FiCheck className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-500" />
                )}
                {usernameStatus === 'taken' && (
                  <FiX className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-red-500" />
                )}
              </div>
              {errors.username ? (
                <p className="text-xs text-red-500 mt-1">{errors.username}</p>
              ) : usernameStatus === 'available' ? (
                <p className="text-xs text-green-500 mt-1">
                  Username available{!usernameManuallyEdited && ' · suggested for you, feel free to change it'}
                </p>
              ) : usernameStatus === 'taken' ? (
                <p className="text-xs text-red-500 mt-1">Username already taken</p>
              ) : null}
            </div>
            <div>
              <div className="relative">
                <input type={showPass ? 'text' : 'password'} placeholder="Password"
                  value={form.password}
                  onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                  className={`input-field pr-10 ${errors.password ? 'border-red-400' : ''}`} />
                <button type="button" onClick={() => setShowPass(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]">
                  {showPass ? <FiEyeOff className="w-4 h-4" /> : <FiEye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password}</p>}
              {form.password && (
                <div className="flex gap-1 mt-2">
                  {[0, 1, 2, 3].map(i => (
                    <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i < strength ? strengthColors[strength - 1] : 'bg-[var(--bg-tertiary)]'}`} />
                  ))}
                  <span className="text-xs text-[var(--text-muted)] ml-2">{strengthLabels[strength - 1] || ''}</span>
                </div>
              )}
            </div>

            <p className="text-xs text-[var(--text-muted)] text-center leading-relaxed">
              By signing up, you agree to our{' '}
              <a href="#" className="text-[var(--text-primary)] font-semibold">Terms</a>,{' '}
              <a href="#" className="text-[var(--text-primary)] font-semibold">Privacy Policy</a> and{' '}
              <a href="#" className="text-[var(--text-primary)] font-semibold">Cookies Policy</a>.
            </p>

            <button type="submit" disabled={loading} className="btn-primary w-full py-2.5 rounded-lg">
              {loading ? <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Creating account...
              </span> : 'Sign up'}
            </button>
          </form>
        </div>

        <div className="card p-5 text-center">
          <p className="text-sm text-[var(--text-secondary)]">
            Have an account?{' '}
            <Link to="/login" className="font-bold text-blue-500 hover:text-blue-600 transition-colors">Log in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
