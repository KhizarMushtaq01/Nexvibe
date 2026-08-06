// frontend/src/pages/Download.jsx
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import PublicHeader from '../components/common/PublicHeader';
import ConfirmDialog from '../components/common/ConfirmDialog';
import { detectPlatform } from '../lib/deviceDetect';
import { getDeferredPrompt, onInstallPromptAvailable, clearDeferredPrompt } from '../lib/installPrompt';
import { FiDownload, FiCheckCircle } from 'react-icons/fi';
import { FaAndroid, FaApple, FaWindows } from 'react-icons/fa6';

const PLATFORM_INFO = {
  android: { label: 'Android', icon: <FaAndroid className="w-6 h-6" /> },
  ios: { label: 'iPhone & iPad', icon: <FaApple className="w-6 h-6" /> },
  windows: { label: 'Windows', icon: <FaWindows className="w-6 h-6" /> },
  macos: { label: 'Mac', icon: <FaApple className="w-6 h-6" /> },
};

const MANUAL_STEPS = {
  android: ['Open the browser menu (⋮).', 'Tap "Install app" or "Add to Home screen".', 'Confirm to add NexVibe to your home screen.'],
  ios: ["Tap the Share icon in Safari's toolbar.", 'Scroll down and tap "Add to Home Screen".', 'Tap "Add" in the top-right corner.'],
  windows: ['Click the install icon in the address bar, or open the browser menu.', 'Choose "Install NexVibe".', 'Confirm to install.'],
  macos: ['Click the install icon in the address bar, or open the browser menu.', 'Choose "Install NexVibe".', 'Confirm to install.'],
};

const PLATFORM_KEYS = Object.keys(PLATFORM_INFO);

const isStandaloneDisplay = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;

export default function Download() {
  const [platform] = useState(() => detectPlatform(navigator.userAgent));
  const [canPrompt, setCanPrompt] = useState(() => !!getDeferredPrompt());
  const [installed, setInstalled] = useState(() => isStandaloneDisplay());
  const [installTarget, setInstallTarget] = useState(null); // platform key whose dialog is open, or null
  const [installStep, setInstallStep] = useState('confirm'); // 'confirm' | 'steps'

  useEffect(() => {
    const unsubscribe = onInstallPromptAvailable(() => setCanPrompt(true));
    return unsubscribe;
  }, []);

  const openInstallDialog = (platformKey) => {
    setInstallTarget(platformKey);
    setInstallStep('confirm');
  };

  const closeInstallDialog = () => {
    setInstallTarget(null);
    setInstallStep('confirm');
  };

  const handleConfirmInstall = async () => {
    if (installTarget === platform && canPrompt) {
      const prompt = getDeferredPrompt();
      if (!prompt) { setInstallStep('steps'); return; }
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
      closeInstallDialog();
    } else {
      setInstallStep('steps');
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <PublicHeader />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
        <div className="text-center mb-12">
          <FiDownload className="w-12 h-12 text-pink-500 mx-auto mb-4" />
          <h1 className="text-4xl sm:text-5xl font-black mb-4">Install NexVibe</h1>
          <p className="text-lg text-[var(--text-secondary)] max-w-xl mx-auto">
            Get the app-like experience — install NexVibe on your device, no app store needed.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {PLATFORM_KEYS.map((p) => {
            const isCurrent = p === platform;
            return (
              <div key={p} className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-2xl p-6 text-center">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-500 to-orange-400 text-white flex items-center justify-center mx-auto mb-3">
                  {PLATFORM_INFO[p].icon}
                </div>
                <div className="flex items-center justify-center gap-2 mb-3">
                  <h2 className="text-lg font-bold">{PLATFORM_INFO[p].label}</h2>
                  {isCurrent && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-[var(--bg-tertiary)] text-[var(--text-muted)]">Your device</span>
                  )}
                </div>
                {isCurrent && installed ? (
                  <p className="flex items-center justify-center gap-2 text-green-600 font-semibold text-sm">
                    <FiCheckCircle className="w-4 h-4" /> Already installed
                  </p>
                ) : (
                  <button onClick={() => openInstallDialog(p)} className="btn-brand inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold">
                    <FiDownload className="w-4 h-4" /> Download
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </main>

      <footer className="border-t border-[var(--border)] bg-[var(--bg-secondary)] py-12 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto text-center">
          <p className="text-sm text-[var(--text-muted)]">© {new Date().getFullYear()} NexVibe. All rights reserved.</p>
        </div>
      </footer>

      <ConfirmDialog
        open={!!installTarget}
        title={installStep === 'confirm' ? `Install NexVibe on ${installTarget ? PLATFORM_INFO[installTarget].label : ''}?` : `Install on ${installTarget ? PLATFORM_INFO[installTarget].label : ''}`}
        message={installStep === 'confirm' ? 'This will start the install process for NexVibe on this platform.' : undefined}
        confirmLabel={installStep === 'confirm' ? 'Yes, Install' : 'Got it'}
        onConfirm={installStep === 'confirm' ? handleConfirmInstall : closeInstallDialog}
        onCancel={closeInstallDialog}
      >
        {installStep === 'steps' && installTarget && (
          <ol className="text-left space-y-2 text-sm text-[var(--text-secondary)] list-decimal list-inside">
            {MANUAL_STEPS[installTarget].map((step) => <li key={step}>{step}</li>)}
          </ol>
        )}
      </ConfirmDialog>
    </div>
  );
}
