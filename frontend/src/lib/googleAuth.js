// frontend/src/lib/googleAuth.js
let scriptPromise = null;

const loadGoogleScript = () => {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Failed to load Google Sign-In'));
    document.head.appendChild(script);
  });
  return scriptPromise;
};

export const triggerGoogleLogin = async () => {
  await loadGoogleScript();
  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
      scope: 'email profile',
      callback: (response) => {
        if (response.error) reject(new Error(response.error));
        else resolve(response.access_token);
      },
    });
    client.requestAccessToken();
  });
};
