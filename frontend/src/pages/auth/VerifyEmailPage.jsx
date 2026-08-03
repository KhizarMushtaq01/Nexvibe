import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { authAPI } from '../../services/api';

export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const [status, setStatus] = useState('verifying');
  const token = params.get('token');

  useEffect(() => {
    if (!token) { setStatus('error'); return; }
    authAPI.verifyEmail(token)
      .then(() => setStatus('success'))
      .catch(() => setStatus('error'));
  }, [token]);

  return (
    <div className="min-h-screen bg-[var(--bg-secondary)] flex items-center justify-center p-4">
      <div className="card p-10 w-full max-w-sm text-center animate-scale-in">
        {status === 'verifying' && (
          <>
            <div className="w-10 h-10 border-2 border-pink-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="font-semibold">Verifying your email…</p>
          </>
        )}
        {status === 'success' && (
          <>
            <div className="text-5xl mb-4">✅</div>
            <h2 className="text-xl font-bold mb-2">Email Verified!</h2>
            <p className="text-sm text-[var(--text-secondary)] mb-6">Your account is now fully activated.</p>
            <Link to="/login" className="btn-primary inline-block px-8 py-2.5 rounded-xl">Go to Login</Link>
          </>
        )}
        {status === 'error' && (
          <>
            <div className="text-5xl mb-4">❌</div>
            <h2 className="text-xl font-bold mb-2">Verification Failed</h2>
            <p className="text-sm text-[var(--text-secondary)] mb-6">Link is invalid or expired.</p>
            <Link to="/login" className="btn-outline inline-block px-8 py-2.5 rounded-xl">Back to Login</Link>
          </>
        )}
      </div>
    </div>
  );
}
