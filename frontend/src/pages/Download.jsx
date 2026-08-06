import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useTheme } from '../context/ThemeContext';
import { detectPlatform } from '../lib/deviceDetect';
import { getDeferredPrompt, onInstallPromptAvailable, clearDeferredPrompt } from '../lib/installPrompt';
import { FiSun, FiMoon, FiDownload, FiCheckCircle } from 'react-icons/fi';
import { FaAndroid, FaApple, FaWindows } from 'react-icons/fa6';
import { BsInstagram } from 'react-icons/bs';

const PLATFORM_INFO = {
  android: { label: 'Android', icon: <FaAndroid className="w-6 h-6" /> },
  ios: { label: 'iPhone & iPad', icon: <FaApple className="w-6 h-6" /> },
  windows: { label: 'Windows', icon: <FaWindows className="w-6 h-6" /> },
  macos: { label: 'Mac', icon: <FaApple className="w-6 h-6" /> },
  other: { label: 'Your device', icon: <FiDownload className="w-6 h-6" /> },
};

const MANUAL_STEPS = {
  android: ['Open the browser menu (⋮).', 'Tap "Install app" or "Add to Home screen".', 'Confirm to add NexVibe to your home screen.'],
  ios: ["Tap the Share icon in Safari's toolbar.", 'Scroll down and tap "Add to Home Screen".', 'Tap "Add" in the top-right corner.'],
  windows: ['Click the install icon in the address bar, or open the browser menu.', 'Choose "Install NexVibe".', 'Confirm to install.'],
  macos: ['Click the install icon in the address bar, or open the browser menu.', 'Choose "Install NexVibe".', 'Confirm to install.'],
  other: ['Open this page in Chrome, Edge, or Safari for install options.'],
};

const isStandaloneDisplay = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;

export default function Download() {
  const { isDark, toggleTheme } = useTheme();
  const [platform] = useState(() => detectPlatform(navigator.userAgent));
  const [canPrompt, setCanPrompt] = useState(() => !!getDeferredPrompt());
  const [installed, setInstalled] = useState(() => isStandaloneDisplay());

  useEffect(() => {
    const unsubscribe = onInstallPromptAvailable(() => setCanPrompt(true));
    return unsubscribe;
  }, []);

  const handleInstall = async () => {
    const prompt = getDeferredPrompt();
    if (!prompt) return;
    prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === 'accepted') {
      toast.success('NexVibe installed!');
      setInstalled(true);
    } else {
      toast('Install dismissed');
    }
    clearDeferredPrompt();
    setCanPrompt(false);
  };

  const otherPlatforms = Object.keys(PLATFORM_INFO).filter((p) => p !== platform && p !== 'other');

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <header className="sticky top-0 z-50 bg-[var(--bg-primary)]/90 backdrop-blur-xl border-b border-[var(--border)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 ig-gradient rounded-xl flex items-center justify-center">
              <BsInstagram className="w-4 h-4 text-white" />
            </div>
            <span className="text-xl font-black text-gradient">NexVibe</span>
          </Link>
          <div className="flex items-center gap-2">
            <button onClick={toggleTheme} className="p-2 rounded-xl hover:bg-[var(--bg-tertiary)] transition-colors text-[var(--text-secondary)]">
              {isDark ? <FiSun className="w-4 h-4" /> : <FiMoon className="w-4 h-4" />}
            </button>
            <Link to="/" className="px-4 py-2 rounded-xl text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors">
              Back to Home
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
        <div className="text-center mb-12">
          <FiDownload className="w-12 h-12 text-pink-500 mx-auto mb-4" />
          <h1 className="text-4xl sm:text-5xl font-black mb-4">Install NexVibe</h1>
          <p className="text-lg text-[var(--text-secondary)] max-w-xl mx-auto">
            Get the app-like experience — install NexVibe on your device, no app store needed.
          </p>
        </div>

        <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-2xl p-8 text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-500 to-orange-400 text-white flex items-center justify-center mx-auto mb-4">
            {PLATFORM_INFO[platform].icon}
          </div>
          <h2 className="text-xl font-bold mb-1">{PLATFORM_INFO[platform].label}</h2>

          {installed ? (
            <p className="flex items-center justify-center gap-2 text-green-600 font-semibold mt-4">
              <FiCheckCircle className="w-5 h-5" /> Already installed on this device
            </p>
          ) : canPrompt ? (
            <button onClick={handleInstall} className="btn-brand inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold mt-4">
              <FiDownload className="w-4 h-4" /> Install App
            </button>
          ) : (
            <ol className="text-left max-w-sm mx-auto space-y-2 mt-4 text-sm text-[var(--text-secondary)] list-decimal list-inside">
              {MANUAL_STEPS[platform].map((step) => <li key={step}>{step}</li>)}
            </ol>
          )}
        </div>

        <details className="border border-[var(--border)] rounded-2xl p-5">
          <summary className="cursor-pointer font-semibold text-sm">Other devices</summary>
          <div className="mt-4 space-y-5">
            {otherPlatforms.map((p) => (
              <div key={p}>
                <h3 className="font-semibold text-sm mb-2 flex items-center gap-2">{PLATFORM_INFO[p].icon} {PLATFORM_INFO[p].label}</h3>
                <ol className="text-sm text-[var(--text-secondary)] list-decimal list-inside space-y-1">
                  {MANUAL_STEPS[p].map((step) => <li key={step}>{step}</li>)}
                </ol>
              </div>
            ))}
          </div>
        </details>
      </main>

      <footer className="border-t border-[var(--border)] bg-[var(--bg-secondary)] py-12 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto text-center">
          <p className="text-sm text-[var(--text-muted)]">© {new Date().getFullYear()} NexVibe. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
