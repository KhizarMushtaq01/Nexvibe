// OTPPage.jsx
import { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { authAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

export default function OTPPage() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const { login } = useAuth();
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const inputs = useRef([]);

  useEffect(() => {
    inputs.current[0]?.focus();
    const timer = setInterval(() => setCountdown(p => p > 0 ? p - 1 : 0), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleChange = (i, val) => {
    if (!/^\d?$/.test(val)) return;
    const next = [...digits];
    next[i] = val;
    setDigits(next);
    if (val && i < 5) inputs.current[i + 1]?.focus();
    if (next.every(d => d) && next.join('').length === 6) {
      handleVerify(next.join(''));
    }
  };

  const handleKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) inputs.current[i - 1]?.focus();
  };

  const handlePaste = (e) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (text.length === 6) {
      setDigits(text.split(''));
      handleVerify(text);
    }
  };

  const handleVerify = async (code = digits.join('')) => {
    if (code.length !== 6) return;
    setLoading(true);
    try {
      const { data } = await authAPI.verifyOTP({ userId: state?.userId, otp: code, purpose: state?.purpose });
      if (data.token) {
        localStorage.setItem('token', data.token);
        window.location.href = '/';
      } else {
        toast.success('Verified!');
        navigate(state?.redirect || '/login');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Invalid code');
      setDigits(['', '', '', '', '', '']);
      inputs.current[0]?.focus();
    } finally { setLoading(false); }
  };

  const handleResend = async () => {
    if (countdown > 0) return;
    setResending(true);
    try {
      await authAPI.resendOTP({ userId: state?.userId, purpose: state?.purpose });
      setCountdown(60);
      toast.success('New code sent!');
    } catch { toast.error('Failed to resend'); }
    finally { setResending(false); }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-secondary)] flex items-center justify-center p-4">
      <div className="card p-8 w-full max-w-[380px] animate-slide-up">
        <div className="text-center mb-6">
          <div className="text-5xl mb-4">📱</div>
          <h1 className="text-2xl font-bold mb-2">Enter the code</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            We sent a 6-digit code to <strong>{state?.email || 'your email'}</strong>
          </p>
        </div>

        <div className="flex gap-3 justify-center mb-6" onPaste={handlePaste}>
          {digits.map((d, i) => (
            <input key={i} ref={el => inputs.current[i] = el}
              type="text" inputMode="numeric" maxLength={1} value={d}
              onChange={e => handleChange(i, e.target.value)}
              onKeyDown={e => handleKeyDown(i, e)}
              className={`w-12 h-14 text-center text-2xl font-bold rounded-xl border-2 transition-all bg-[var(--bg-tertiary)] outline-none
                ${d ? 'border-pink-500 text-[var(--text-primary)]' : 'border-[var(--border)]'}
                focus:border-pink-500`}
            />
          ))}
        </div>

        <button onClick={() => handleVerify()} disabled={loading || digits.join('').length !== 6}
          className="btn-primary w-full py-3 rounded-xl text-base">
          {loading ? <span className="flex items-center justify-center gap-2">
            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Verifying...
          </span> : 'Verify'}
        </button>

        <div className="text-center mt-4">
          <button onClick={handleResend} disabled={countdown > 0 || resending}
            className={`text-sm font-semibold transition-colors ${countdown > 0 ? 'text-[var(--text-muted)]' : 'text-blue-500 hover:text-blue-600'}`}>
            {countdown > 0 ? `Resend code in ${countdown}s` : resending ? 'Sending...' : 'Resend code'}
          </button>
        </div>

        <button onClick={() => navigate(-1)} className="w-full text-center mt-3 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
          ← Go back
        </button>
      </div>
    </div>
  );
}
