// frontend/src/components/common/PublicHeader.jsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { FiSun, FiMoon, FiMenu, FiX } from 'react-icons/fi';
import { BsInstagram } from 'react-icons/bs';

const NAV_LINKS = [
  { label: 'Features', path: '/#features' },
  { label: 'Reels', path: '/#reels' },
  { label: 'Community', path: '/community' },
  { label: 'Security', path: '/security' },
  { label: 'Download', path: '/download' },
];

export default function PublicHeader() {
  const { user } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-[var(--bg-primary)]/90 backdrop-blur-xl border-b border-[var(--border)]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 ig-gradient rounded-xl flex items-center justify-center">
            <BsInstagram className="w-4 h-4 text-white" />
          </div>
          <span className="text-xl font-black text-gradient">NexVibe</span>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map(l => (
            <Link key={l.path} to={l.path}
              className="px-4 py-2 rounded-xl text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-all">
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <button onClick={toggleTheme} className="p-2 rounded-xl hover:bg-[var(--bg-tertiary)] transition-colors text-[var(--text-secondary)]">
            {isDark ? <FiSun className="w-4 h-4" /> : <FiMoon className="w-4 h-4" />}
          </button>
          {user ? (
            <Link to="/feed" className="btn-brand px-4 py-2 text-sm rounded-xl">
              Go to feed
            </Link>
          ) : (
            <>
              <Link to="/login" className="hidden sm:block px-4 py-2 rounded-xl text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors">
                Log in
              </Link>
              <Link to="/register" className="btn-brand px-4 py-2 text-sm rounded-xl">
                Sign up free
              </Link>
            </>
          )}
          <button onClick={() => setMobileMenuOpen(v => !v)} className="md:hidden p-2 rounded-xl hover:bg-[var(--bg-tertiary)] transition-colors">
            {mobileMenuOpen ? <FiX className="w-5 h-5" /> : <FiMenu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden bg-[var(--bg-primary)] border-t border-[var(--border)] px-4 py-4 space-y-1 animate-slide-down">
          {NAV_LINKS.map(l => (
            <Link key={l.path} to={l.path} onClick={() => setMobileMenuOpen(false)}
              className="block w-full text-left px-4 py-3 rounded-xl text-sm font-medium hover:bg-[var(--bg-tertiary)] transition-colors">
              {l.label}
            </Link>
          ))}
          <div className="pt-2 flex flex-col gap-2">
            {user ? (
              <Link to="/feed" onClick={() => setMobileMenuOpen(false)} className="btn-brand w-full text-center py-2.5 rounded-xl text-sm">Go to feed</Link>
            ) : (
              <>
                <Link to="/login" onClick={() => setMobileMenuOpen(false)} className="btn-outline w-full text-center py-2.5 rounded-xl text-sm">Log in</Link>
                <Link to="/register" onClick={() => setMobileMenuOpen(false)} className="btn-brand w-full text-center py-2.5 rounded-xl text-sm">Sign up free</Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
