let deferredPrompt = null;
const listeners = new Set();

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredPrompt = event;
  listeners.forEach((callback) => callback(event));
});

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
});

export const getDeferredPrompt = () => deferredPrompt;

export const onInstallPromptAvailable = (callback) => {
  listeners.add(callback);
  return () => listeners.delete(callback);
};

export const clearDeferredPrompt = () => {
  deferredPrompt = null;
};
