// ForgotPasswordPage.jsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { authAPI } from '../../services/api';
import toast from 'react-hot-toast';
import { FiMail, FiLock } from 'react-icons/fi';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email) return toast.error('Please enter your email');
    setLoading(true);
    try {
      await authAPI.forgotPassword(email);
      setSent(true);
      toast.success('Reset link sent if account exists');
    } catch { toast.error('Something went wrong'); }
    finally { setLoading(false); }
  };

  if (sent) return (
    <div className="min-h-screen bg-[var(--bg-secondary)] flex items-center justify-center p-3 sm:p-4">
      <div className="card p-6 sm:p-8 w-full max-w-[380px] text-center animate-scale-in">
        <div className="w-14 h-14 sm:w-16 sm:h-16 mx-auto mb-4 rounded-full bg-pink-500/10 flex items-center justify-center">
          <FiMail className="w-7 h-7 sm:w-8 sm:h-8 text-pink-500" />
        </div>
        <h2 className="text-lg sm:text-xl font-bold mb-2">Check your email</h2>
        <p className="text-sm text-[var(--text-secondary)] mb-6 break-words">We sent a password reset link to <strong>{email}</strong></p>
        <Link to="/login" className="btn-primary inline-block px-6 py-2.5 rounded-xl">Back to login</Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[var(--bg-secondary)] flex items-center justify-center p-3 sm:p-4">
      <div className="card p-6 sm:p-8 w-full max-w-[380px] animate-fade-in">
        <div className="text-center mb-6">
          <div className="w-14 h-14 sm:w-16 sm:h-16 mx-auto mb-4 rounded-full bg-pink-500/10 flex items-center justify-center">
            <FiLock className="w-7 h-7 sm:w-8 sm:h-8 text-pink-500" />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold mb-1">Trouble logging in?</h1>
          <p className="text-sm text-[var(--text-secondary)]">Enter your email and we'll send you a link to get back into your account.</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input type="email" placeholder="Email" value={email}
            onChange={e => setEmail(e.target.value)} className="input-field" />
          <button type="submit" disabled={loading} className="btn-primary w-full py-2.5 rounded-xl">
            {loading ? 'Sending...' : 'Send reset link'}
          </button>
        </form>
        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px bg-[var(--border)]" />
          <span className="text-xs text-[var(--text-muted)]">OR</span>
          <div className="flex-1 h-px bg-[var(--border)]" />
        </div>
        <div className="text-center">
          <Link to="/register" className="font-bold text-sm text-[var(--text-primary)]">Create new account</Link>
        </div>
        <div className="text-center mt-4 pt-4 border-t border-[var(--border)]">
          <Link to="/login" className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]">← Back to log in</Link>
        </div>
      </div>
    </div>
  );
}
