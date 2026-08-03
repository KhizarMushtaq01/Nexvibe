import { useState } from 'react';
import { FiEye, FiPhone } from 'react-icons/fi';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import { FcGoogle } from 'react-icons/fc';
import { FaFacebook, FaApple } from 'react-icons/fa6';
import { FaXTwitter } from "react-icons/fa6";
import { useTheme } from '../../context/ThemeContext';

export default function RegisterPage() {
  const { register } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ fullName: '', username: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [errors, setErrors] = useState({});

  const validate = () => {
    const e = {};
    if (!form.fullName.trim()) e.fullName = 'Full name required';
    if (!form.username.trim()) e.username = 'Username required';
    else if (form.username.length < 3) e.username = 'Min 3 characters';
    else if (!/^[a-zA-Z0-9._]+$/.test(form.username)) e.username = 'Letters, numbers, dots, underscores only';
    if (!form.email) e.email = 'Email required';
    else if (!/\S+@\S+\.\S+/.test(form.email)) e.email = 'Invalid email';
    if (!form.password) e.password = 'Password required';
    else if (form.password.length < 8) e.password = 'Min 8 characters';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const data = await register(form);
      toast.success('Account created! Please verify your email.');
      navigate('/otp', { state: { userId: data.userId, purpose: 'register', email: form.email } });
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

  return (
    <div className="min-h-screen bg-[var(--bg-secondary)] flex items-center justify-center p-4">
      <button onClick={toggleTheme} className="fixed top-4 right-4 p-2 rounded-full hover:bg-[var(--bg-tertiary)] transition-colors text-[var(--text-secondary)]">
        {isDark ? '☀️' : '🌙'}
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
            {[
              { icon: <FcGoogle className="w-5 h-5" />, label: 'Continue with Google' },
              { icon: <FaFacebook className="w-5 h-5 text-[#1877F2]" />, label: 'Continue with Facebook' },
              { icon: <FaApple className="w-5 h-5" />, label: 'Continue with Apple' },
              { icon: <FaXTwitter className="w-5 h-5" />, label: 'Continue with X' },
              { icon: <FiPhone className="w-5 h-5 text-green-500" />, label: 'Continue with Phone' },
            ].map(({ icon, label }) => (
              <button key={label} onClick={() => toast('OAuth requires backend config', { icon: 'ℹ️' })}
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
              <input type="text" placeholder="Username" value={form.username}
                onChange={e => setForm(p => ({ ...p, username: e.target.value.toLowerCase() }))}
                className={`input-field ${errors.username ? 'border-red-400' : ''}`} />
              {errors.username && <p className="text-xs text-red-500 mt-1">{errors.username}</p>}
            </div>
            <div>
              <input type="email" placeholder="Email" value={form.email}
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                className={`input-field ${errors.email ? 'border-red-400' : ''}`} />
              {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
            </div>
            <div>
              <div className="relative">
                <input type={showPass ? 'text' : 'password'} placeholder="Password"
                  value={form.password}
                  onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                  className={`input-field pr-10 ${errors.password ? 'border-red-400' : ''}`} />
                <button type="button" onClick={() => setShowPass(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]">
                  {showPass ? <FiEyeInvisible className="w-4 h-4" /> : <FiEye className="w-4 h-4" />}
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
