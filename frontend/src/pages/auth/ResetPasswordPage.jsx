// ResetPasswordPage.jsx
import { useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { authAPI } from '../../services/api';
import toast from 'react-hot-toast';
import { FiEye, FiEyeOff } from 'react-icons/fi';

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [form, setForm] = useState({ password: '', confirm: '' });
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const token = params.get('token');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.password || form.password.length < 8) return toast.error('Password must be at least 8 characters');
    if (form.password !== form.confirm) return toast.error("Passwords don't match");
    if (!token) return toast.error('Invalid reset link');
    setLoading(true);
    try {
      await authAPI.resetPassword(token, form.password);
      toast.success('Password reset successfully!');
      navigate('/login');
    } catch (err) { toast.error(err.response?.data?.message || 'Reset failed'); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-secondary)] flex items-center justify-center p-4">
      <div className="card p-8 w-full max-w-[380px] animate-fade-in">
        <div className="text-center mb-6">
          <div className="text-5xl mb-4">🔑</div>
          <h1 className="text-2xl font-bold mb-1">Create new password</h1>
          <p className="text-sm text-[var(--text-secondary)]">Your new password must be at least 8 characters.</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="relative">
            <input type={showPass ? 'text' : 'password'} placeholder="New password"
              value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
              className="input-field pr-10" />
            <button type="button" onClick={() => setShowPass(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]">
              {showPass ? <FiEyeInvisible className="w-4 h-4" /> : <FiEye className="w-4 h-4" />}
            </button>
          </div>
          <input type="password" placeholder="Confirm new password"
            value={form.confirm} onChange={e => setForm(p => ({ ...p, confirm: e.target.value }))}
            className="input-field" />
          <button type="submit" disabled={loading} className="btn-primary w-full py-2.5 rounded-xl">
            {loading ? 'Resetting...' : 'Reset password'}
          </button>
        </form>
        <div className="text-center mt-4">
          <Link to="/login" className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]">← Back to login</Link>
        </div>
      </div>
    </div>
  );
}
