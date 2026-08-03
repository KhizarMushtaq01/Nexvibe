import { useState } from 'react';
import { FiEye, FiPhone } from 'react-icons/fi';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import toast from 'react-hot-toast';
import { FcGoogle } from 'react-icons/fc';
import { FaFacebook, FaApple, FaXTwitter } from "react-icons/fa6";

export default function LoginPage() {
  const { login } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [form, setForm] = useState({ identifier: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.identifier || !form.password) return toast.error('Please fill all fields');
    setLoading(true);
    try {
      const data = await login(form.identifier, form.password);
      if (data.requiresTwoFactor) {
        navigate('/otp', { state: { userId: data.userId, purpose: '2fa' } });
        return;
      }
      toast.success('Welcome back!');
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Login failed');
    } finally { setLoading(false); }
  };

  const oauthProviders = [
    { icon: <FcGoogle className="w-5 h-5" />, label: 'Continue with Google', provider: 'google', color: 'border-[var(--border)]' },
    { icon: <FaFacebook className="w-5 h-5 text-[#1877F2]" />, label: 'Continue with Facebook', provider: 'facebook', color: 'border-[var(--border)]' },
    { icon: <FaApple className="w-5 h-5" />, label: 'Continue with Apple', provider: 'apple', color: 'border-[var(--border)]' },
    { icon: <FaXTwitter className="w-5 h-5" />, label: 'Continue with X', provider: 'twitter', color: 'border-[var(--border)]' },
    { icon: <FiPhone className="w-5 h-5 text-green-500" />, label: 'Continue with Phone', provider: 'phone', color: 'border-[var(--border)]' },
  ];

  const handleOAuth = (provider) => {
    if (provider === 'phone') {
      navigate('/register?method=phone');
      return;
    }
    toast('OAuth requires backend configuration', { icon: 'ℹ️' });
  };

  return (
    <div className="min-h-screen bg-[var(--bg-secondary)] flex items-center justify-center p-4">
      {/* Theme toggle */}
      <button onClick={toggleTheme} className="fixed top-4 right-4 p-2 rounded-full hover:bg-[var(--bg-tertiary)] transition-colors text-[var(--text-secondary)]">
        {isDark ? '☀️' : '🌙'}
      </button>

      <div className="w-full max-w-[350px]">
        {/* Main card */}
        <div className="card p-8 mb-3 animate-fade-in">
          {/* Logo */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-black text-gradient mb-1">NexVibe</h1>
            <p className="text-sm text-[var(--text-secondary)]">Sign in to see photos & videos</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="text"
              placeholder="Username, email or phone"
              value={form.identifier}
              onChange={e => setForm(p => ({ ...p, identifier: e.target.value }))}
              className="input-field"
              autoComplete="username"
            />
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                placeholder="Password"
                value={form.password}
                onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                className="input-field pr-10"
                autoComplete="current-password"
              />
              <button type="button" onClick={() => setShowPass(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]">
                {showPass ? <FiEyeInvisible className="w-4 h-4" /> : <FiEye className="w-4 h-4" />}
              </button>
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full py-2.5 rounded-lg mt-1">
              {loading ? <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Signing in...</span> : 'Log in'}
            </button>
          </form>

          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-[var(--border)]" />
            <span className="text-xs text-[var(--text-muted)] font-medium">OR</span>
            <div className="flex-1 h-px bg-[var(--border)]" />
          </div>

          <div className="space-y-2">
            {oauthProviders.map(({ icon, label, provider }) => (
              <button key={provider} onClick={() => handleOAuth(provider)}
                className="w-full flex items-center gap-3 px-4 py-2.5 border border-[var(--border)] rounded-lg hover:bg-[var(--bg-tertiary)] transition-all duration-200 text-sm font-medium active:scale-[0.98]">
                {icon}
                <span>{label}</span>
              </button>
            ))}
          </div>

          <div className="text-center mt-5">
            <Link to="/forgot-password" className="text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
              Forgot password?
            </Link>
          </div>
        </div>

        {/* Sign up card */}
        <div className="card p-5 text-center">
          <p className="text-sm text-[var(--text-secondary)]">
            Don't have an account?{' '}
            <Link to="/register" className="font-bold text-blue-500 hover:text-blue-600 transition-colors">Sign up</Link>
          </p>
        </div>

        {/* App download */}
        <div className="text-center mt-5">
          <p className="text-xs text-[var(--text-muted)] mb-3">Get the app.</p>
          <div className="flex items-center justify-center gap-2">
            <a href="#" className="px-3 py-1.5 border border-[var(--border)] rounded-lg text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors">App Store</a>
            <a href="#" className="px-3 py-1.5 border border-[var(--border)] rounded-lg text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors">Google Play</a>
          </div>
        </div>
      </div>
    </div>
  );
}
