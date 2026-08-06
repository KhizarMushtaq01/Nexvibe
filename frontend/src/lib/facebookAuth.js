// frontend/src/lib/facebookAuth.js
let scriptPromise = null;

const loadFacebookScript = () => {
  if (window.FB) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    window.fbAsyncInit = () => {
      window.FB.init({ appId: import.meta.env.VITE_FACEBOOK_APP_ID, version: 'v19.0', cookie: false, xfbml: false });
      resolve();
    };
    const script = document.createElement('script');
    script.src = 'https://connect.facebook.net/en_US/sdk.js';
    script.async = true;
    script.onerror = () => reject(new Error('Failed to load Facebook SDK'));
    document.head.appendChild(script);
  });
  return scriptPromise;
};

export const triggerFacebookLogin = async () => {
  await loadFacebookScript();
  return new Promise((resolve, reject) => {
    window.FB.login((response) => {
      if (response.authResponse?.accessToken) resolve(response.authResponse.accessToken);
      else reject(new Error('Facebook login was cancelled or denied'));
    }, { scope: 'email' });
  });
};
