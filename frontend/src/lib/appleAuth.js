// frontend/src/lib/appleAuth.js
let scriptPromise = null;

const loadAppleScript = () => {
  if (window.AppleID) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Failed to load Sign in with Apple'));
    document.head.appendChild(script);
  });
  return scriptPromise;
};

export const triggerAppleLogin = async () => {
  await loadAppleScript();
  window.AppleID.auth.init({
    clientId: import.meta.env.VITE_APPLE_CLIENT_ID,
    scope: 'name email',
    redirectURI: window.location.origin,
    usePopup: true,
  });
  const response = await window.AppleID.auth.signIn();
  const idToken = response.authorization.id_token;
  const nameParts = response.user?.name;
  const fullName = nameParts ? [nameParts.firstName, nameParts.lastName].filter(Boolean).join(' ') : undefined;
  return { idToken, fullName };
};
