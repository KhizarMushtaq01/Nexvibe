# Google / Phone / Facebook / Apple Sign-in Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all four "Continue with X" buttons on Login and Register actually work, with every identity verified server-side against the real provider — replacing today's stub buttons and the client-trusting `/api/auth/oauth` endpoint (a real impersonation hole) and the fake phone-OTP flow (never sends an SMS, leaks the code in the response).

**Architecture:** One shared backend dispatcher (`oauthLogin`, keyed by a `PROVIDER_VERIFIERS` map) is established in Task 1 and extended by one function + one map entry per task thereafter. Frontend: each provider's SDK is lazy-loaded via a `<script>` tag only when its button is clicked (`frontend/src/lib/{provider}Auth.js`), and both `LoginPage.jsx`/`RegisterPage.jsx` route every button through one `handleOAuth(provider)` function established in Task 1, extended by one `if` branch per task thereafter. Phone reuses the existing `OTPPage.jsx`/`verifyOTP` flow rather than building anything new.

**Tech Stack:** Express, Node's native `fetch` (Google/Facebook verification), `apple-signin-auth` (Apple), `twilio` (SMS), React, existing `DialogContext`'s `usePrompt()` for the phone-number entry step.

## Global Constraints

- Every provider's identity claim is verified against that provider's own servers before an account is created or a session issued — never trust client-supplied `email`/`fullName`/`providerId` directly (the one narrow, explicitly-scoped exception: Apple's one-time client-supplied `fullName`, which can only improve a new account's display name, never override a verified `providerId`/`email`).
- No new frontend npm dependencies — every provider SDK loads via a lazy `<script>` tag.
- Client IDs go in `VITE_`-prefixed frontend env vars (public by design); all secrets (`FACEBOOK_APP_SECRET`, Twilio credentials) stay backend-only.
- Real end-to-end success-path testing (an actual Google/Facebook/Apple/Twilio round-trip) is not possible until the user supplies real credentials — each task's live-verification step is scoped to what's checkable without them (script loads correctly, request shape is right, backend correctly rejects invalid/fake tokens with 401 rather than crashing or creating an account), and must say so explicitly rather than claiming a full round-trip that didn't happen.

---

## Task 1: Google sign-in + shared dispatcher + `FiEyeInvisible` bugfix

**Files:**
- Create: `frontend/src/lib/googleAuth.js`
- Create: `frontend/.env.example`
- Modify: `backend/controllers/authController.js`
- Modify: `frontend/src/pages/auth/LoginPage.jsx`
- Modify: `frontend/src/pages/auth/RegisterPage.jsx`

**Interfaces:**
- Produces: `PROVIDER_VERIFIERS` map in `authController.js` (keys: `google` for now) — Tasks 3/4 add `facebook`/`apple` entries to this same map.
- Produces: `handleOAuth(provider)` in both page files with an `if (provider === 'google') {...}` branch followed by a catch-all stub toast — Tasks 2/3/4 each insert one more `if` branch before that catch-all, in the same function.
- Produces: `export const triggerGoogleLogin = async () => Promise<accessToken: string>` from `frontend/src/lib/googleAuth.js`.

- [ ] **Step 1: Rewrite `oauthLogin` and add `verifyGoogleToken` in `backend/controllers/authController.js`**

Replace the existing `oauthLogin` function (currently reading `{ provider, providerId, email, fullName, avatar, username }` straight from `req.body`) with:

```js
const verifyGoogleToken = async (accessToken) => {
  const infoRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${accessToken}`);
  if (!infoRes.ok) throw new Error('Invalid Google token');
  const info = await infoRes.json();
  if (info.aud !== process.env.GOOGLE_CLIENT_ID) throw new Error('Token audience mismatch');

  const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const profile = profileRes.ok ? await profileRes.json() : {};

  return { providerId: info.sub, email: info.email, fullName: profile.name, avatar: profile.picture };
};

const PROVIDER_VERIFIERS = {
  google: verifyGoogleToken,
};

// @desc    OAuth callback handler (Google/Facebook/Apple)
// @route   POST /api/auth/oauth
export const oauthLogin = async (req, res) => {
  try {
    const { provider, token } = req.body;
    const verify = PROVIDER_VERIFIERS[provider];
    if (!verify || !token) {
      return res.status(400).json({ success: false, message: 'Invalid provider or token' });
    }

    let identity;
    try {
      identity = await verify(token); // { providerId, email, fullName, avatar } -- verified fields only
    } catch {
      return res.status(401).json({ success: false, message: 'Could not verify identity with provider' });
    }
    const { providerId, email, avatar } = identity;
    // Apple never embeds a display name in the verifiable token -- it hands
    // one to the client directly, once, on first sign-in only. Honored here
    // ONLY for provider === 'apple' (added in Task 4), and only as a
    // fallback name for a brand-new account, never to override
    // providerId/email.
    const fullName = (provider === 'apple' && req.body.fullName) || identity.fullName;

    let user = await User.findOne({ [`${provider}Id`]: providerId });
    if (!user && email) user = await User.findOne({ email });

    if (!user) {
      let username = email?.split('@')[0] || `user${Date.now()}`;
      username = username.toLowerCase().replace(/[^a-z0-9._]/g, '');
      const exists = await User.findOne({ username });
      if (exists) username = `${username}${Math.floor(1000 + Math.random() * 9000)}`;

      user = await User.create({
        fullName: fullName || 'New User',
        username,
        email,
        avatar,
        [`${provider}Id`]: providerId,
        authProvider: provider,
        isEmailVerified: true
      });
      await sendWelcomeEmail(user);
    } else {
      user[`${provider}Id`] = providerId;
      if (!user.avatar && avatar) user.avatar = avatar;
      user.isEmailVerified = true;
      user.lastSeen = new Date();
      await user.save();
    }

    sendTokenResponse(user, 200, res, 'OAuth login successful');
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
```

`fetch` is Node's native global (Node 18+, already the runtime here) — no new import needed for this step.

- [ ] **Step 2: Create `frontend/src/lib/googleAuth.js`**

```js
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
```

- [ ] **Step 3: Create `frontend/.env.example`**

```
# Vite only exposes VITE_-prefixed variables to client code.
# Client IDs are public identifiers, safe to ship in the frontend bundle.

VITE_GOOGLE_CLIENT_ID=your_google_oauth_client_id
```

- [ ] **Step 4: Rewrite `LoginPage.jsx`'s OAuth section and fix `FiEyeInvisible`**

Change the import line:
```js
import { FiEye, FiEyeOff, FiPhone, FiSun, FiMoon } from 'react-icons/fi';
```
(was `import { FiEye, FiPhone, FiSun, FiMoon } from 'react-icons/fi';` — adds `FiEyeOff`, the real Feather icon name; `FiEyeInvisible` never existed in this package.)

Change the password-toggle icon usage:
```jsx
{showPass ? <FiEyeOff className="w-4 h-4" /> : <FiEye className="w-4 h-4" />}
```

Add the import:
```js
import { triggerGoogleLogin } from '../../lib/googleAuth';
```

Destructure `oauthLogin` alongside the existing `login`:
```js
const { login, oauthLogin } = useAuth();
```

Replace the existing `handleOAuth` function:
```js
const handleOAuth = async (provider) => {
  if (provider === 'google') {
    try {
      const accessToken = await triggerGoogleLogin();
      const data = await oauthLogin(provider, { token: accessToken });
      if (data.requiresTwoFactor) {
        navigate('/otp', { state: { userId: data.userId, purpose: '2fa' } });
        return;
      }
      toast.success('Welcome!');
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Google sign-in failed');
    }
    return;
  }
  toast('OAuth requires backend configuration', { icon: 'ℹ️' });
};
```

Everything else in this file (the `oauthProviders` array, the form, the render) is unchanged.

- [ ] **Step 5: Rewrite `RegisterPage.jsx`'s OAuth section and fix `FiEyeInvisible`**

Change the import line:
```js
import { FiEye, FiEyeOff, FiPhone, FiSun, FiMoon } from 'react-icons/fi';
```

Change the password-toggle icon usage:
```jsx
{showPass ? <FiEyeOff className="w-4 h-4" /> : <FiEye className="w-4 h-4" />}
```

Add the import:
```js
import { triggerGoogleLogin } from '../../lib/googleAuth';
```

Destructure `oauthLogin` alongside the existing `register`:
```js
const { register, oauthLogin } = useAuth();
```

This file currently has the OAuth buttons as an inline anonymous array with no `provider` key and a single onClick that always shows the stub toast (unlike `LoginPage.jsx`, which already has a named `oauthProviders` array and a `handleOAuth` dispatcher). Replace that whole block:

```jsx
          {/* OAuth buttons */}
          <div className="space-y-2 mb-4">
            {[
              { icon: <FcGoogle className="w-5 h-5" />, label: 'Continue with Google' },
              { icon: <FaFacebook className="w-5 h-5 text-[#1877F2]" />, label: 'Continue with Facebook' },
              { icon: <FaApple className="w-5 h-5" />, label: 'Continue with Apple' },
              { icon: <FaXTwitter className="w-5 h-5" />, label: 'Continue with X' },
              { icon: <FiPhone className="w-5 h-5 text-green-500" />, label: 'Continue with Phone' },
            ].map(({ icon, label }) => (
              <button key={label} onClick={() => toast('OAuth requires backend config', { icon: 'ℹ️' })}
                className="w-full flex items-center gap-3 px-4 py-2 border border-[var(--border)] rounded-lg hover:bg-[var(--bg-tertiary)] transition-all text-sm font-medium">
                {icon} {label}
              </button>
            ))}
          </div>
```

with:

```jsx
          {/* OAuth buttons */}
          <div className="space-y-2 mb-4">
            {oauthProviders.map(({ icon, label, provider }) => (
              <button key={provider} onClick={() => handleOAuth(provider)}
                className="w-full flex items-center gap-3 px-4 py-2 border border-[var(--border)] rounded-lg hover:bg-[var(--bg-tertiary)] transition-all text-sm font-medium">
                {icon} {label}
              </button>
            ))}
          </div>
```

And add, right before the `return (` statement in the component body:

```js
  const oauthProviders = [
    { icon: <FcGoogle className="w-5 h-5" />, label: 'Continue with Google', provider: 'google' },
    { icon: <FaFacebook className="w-5 h-5 text-[#1877F2]" />, label: 'Continue with Facebook', provider: 'facebook' },
    { icon: <FaApple className="w-5 h-5" />, label: 'Continue with Apple', provider: 'apple' },
    { icon: <FaXTwitter className="w-5 h-5" />, label: 'Continue with X', provider: 'twitter' },
    { icon: <FiPhone className="w-5 h-5 text-green-500" />, label: 'Continue with Phone', provider: 'phone' },
  ];

  const handleOAuth = async (provider) => {
    if (provider === 'google') {
      try {
        const accessToken = await triggerGoogleLogin();
        await oauthLogin(provider, { token: accessToken });
        toast.success('Welcome to NexVibe!');
        navigate('/');
      } catch (err) {
        toast.error(err.response?.data?.message || err.message || 'Google sign-in failed');
      }
      return;
    }
    toast('OAuth requires backend configuration', { icon: 'ℹ️' });
  };
```

- [ ] **Step 6: Verify it builds**

Run inside `frontend/`:
```bash
npm run build
```
Expected: build succeeds with no import/reference errors (in particular, no leftover `FiEyeInvisible` reference in either file, no leftover `toast('OAuth requires backend config'...)` literal-array structure in `RegisterPage.jsx`).

- [ ] **Step 7: Verify what's checkable without real Google credentials**

`backend/.env`'s `GOOGLE_CLIENT_ID` and `frontend/.env`'s `VITE_GOOGLE_CLIENT_ID` are very likely still empty placeholders at this point (the user adds real values later) — that's expected, don't treat an empty value as a blocker, verify what's checkable regardless:

1. Run inside `frontend/`: `npm run dev`. Using the project's `run` skill (or a direct Playwright driver if no `chromium-cli` tool exists in this environment), open `/login`, open the browser's Network tab, click "Continue with Google". Confirm a request to `accounts.google.com/gsi/client` fires (the lazy-load working), regardless of whether Google's own popup then succeeds or errors due to a missing/invalid client ID (a client-side error at that point is expected and fine — it proves our code correctly handed off to Google's SDK).
2. Confirm the same on `/register`.
3. Confirm the password-reveal eye icon (click it after typing something in the password field) no longer throws — toggles between hidden/visible text with no console error, on both pages.
4. Test the backend's rejection path directly (this part IS fully testable without real credentials):
   ```bash
   curl -s -X POST http://localhost:5000/api/auth/oauth -H "Content-Type: application/json" -d '{"provider":"google","token":"not-a-real-token"}'
   ```
   Expected: `{"success":false,"message":"Could not verify identity with provider"}` with a 401 status — confirms `verifyGoogleToken` correctly rejects a garbage token rather than crashing or creating an account. Also test the shape-validation branch:
   ```bash
   curl -s -X POST http://localhost:5000/api/auth/oauth -H "Content-Type: application/json" -d '{"provider":"bogus","token":"x"}'
   ```
   Expected: `{"success":false,"message":"Invalid provider or token"}` with a 400 status.

Report explicitly that full success-path testing (a real Google account actually logging in) was not performed and requires the user to supply real `GOOGLE_CLIENT_ID`/`VITE_GOOGLE_CLIENT_ID` values first.

- [ ] **Step 8: Commit**

```bash
git add backend/controllers/authController.js frontend/src/lib/googleAuth.js frontend/.env.example frontend/src/pages/auth/LoginPage.jsx frontend/src/pages/auth/RegisterPage.jsx
git commit -m "feat: wire up functional Google sign-in with server-side token verification"
```

---

## Task 2: Phone sign-in via real Twilio SMS

**Files:**
- Modify: `backend/controllers/authController.js`
- Modify: `backend/package.json` (add `twilio` dependency)
- Modify: `backend/.env.example`
- Modify: `frontend/src/pages/auth/LoginPage.jsx`
- Modify: `frontend/src/pages/auth/RegisterPage.jsx`
- Modify: `frontend/src/pages/auth/OTPPage.jsx`

**Interfaces:**
- Consumes: `usePrompt` from `frontend/src/context/DialogContext.jsx` (already built).
- Consumes/extends: the `handleOAuth(provider)` function from Task 1 — adds one `if (provider === 'phone')` branch.

- [ ] **Step 1: Install the `twilio` package**

Run inside `backend/`:
```bash
npm install twilio
```

- [ ] **Step 2: Rewrite `sendPhoneOTP` and update `verifyOTP` in `backend/controllers/authController.js`**

Add the import near the top of the file, alongside the other imports:
```js
import twilio from 'twilio';
```

Add, right after the imports (module scope, alongside `PROVIDER_VERIFIERS` from Task 1):
```js
const twilioClient = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;
```
(Guarded so the server doesn't crash on startup/import if Twilio credentials aren't set yet — `sendPhoneOTP` below checks `twilioClient` before using it.)

Replace the existing `sendPhoneOTP` function (currently commented `// In production, integrate with Twilio or similar`, generates a fake code, and returns the OTP directly in the response for new numbers) with:

```js
// @desc    Send phone OTP
// @route   POST /api/auth/phone-otp
export const sendPhoneOTP = async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ success: false, message: 'Phone number required' });
    if (!twilioClient) return res.status(500).json({ success: false, message: 'SMS delivery is not configured' });

    let user = await User.findOne({ phone });
    if (!user) {
      const username = `user${Date.now()}`;
      user = await User.create({ fullName: 'New User', username, phone, authProvider: 'phone' });
    }

    const otp = user.generateOTP('phone_login');
    await user.save();

    await twilioClient.messages.create({
      body: `Your NexVibe verification code is: ${otp}`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phone
    });

    res.json({ success: true, message: 'OTP sent', userId: user._id });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
```

In the existing `verifyOTP` function, find this line:
```js
    if (purpose === 'register' || purpose === '2fa' || purpose === 'login') {
```
and change it to:
```js
    if (purpose === 'register' || purpose === '2fa' || purpose === 'login' || purpose === 'phone_login') {
```
Directly below that, inside the same `if` block, right after the existing `user.isEmailVerified = true;` line, add:
```js
      if (purpose === 'phone_login') user.isPhoneVerified = true;
```
(leaving `user.isEmailVerified = true;` itself unchanged — a phone-verified user isn't email-verified by this, but that line's existing unconditional behavior for the other three purposes isn't this task's concern to fix, only to extend for the new purpose without introducing a wrong side effect for it. Read the current function body first — the two lines must end up adjacent, in that order, inside the same `if` block, before `await user.save();`.)

- [ ] **Step 3: Add Twilio env var placeholders**

In `backend/.env.example`, add after the existing `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` lines:
```
# Twilio (SMS OTP - https://console.twilio.com)
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=your_twilio_phone_number
```

- [ ] **Step 4: Wire up the Phone button on both pages**

In `frontend/src/pages/auth/LoginPage.jsx`, add this import:
```js
import { usePrompt } from '../../context/DialogContext';
```
Add the hook call alongside the existing `const { login, oauthLogin } = useAuth();` line:
```js
const promptDialog = usePrompt();
```
In `handleOAuth` (from Task 1), insert this branch right before the final `toast('OAuth requires backend configuration', ...)` fallback line:
```js
  if (provider === 'phone') {
    const phone = await promptDialog({ title: 'Enter your phone number', inputPlaceholder: '+1 234 567 8900' });
    if (!phone) return;
    try {
      const { data } = await authAPI.sendPhoneOTP(phone);
      navigate('/otp', { state: { userId: data.userId, purpose: 'phone_login', phone } });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send code');
    }
    return;
  }
```
This needs `authAPI` imported directly (not just via the `useAuth()` context) — add:
```js
import { authAPI } from '../../services/api';
```

Apply the identical 3-part change (the `usePrompt` import, the `promptDialog` hook call, the `if (provider === 'phone')` branch inserted before the fallback toast in `handleOAuth`, and the `authAPI` import) to `frontend/src/pages/auth/RegisterPage.jsx`.

- [ ] **Step 5: Make `OTPPage.jsx` display a phone number when present**

Change:
```jsx
            We sent a 6-digit code to <strong>{state?.email || 'your email'}</strong>
```
to:
```jsx
            We sent a 6-digit code to <strong>{state?.phone || state?.email || 'your email'}</strong>
```

- [ ] **Step 6: Verify it builds**

Run inside `frontend/`:
```bash
npm run build
```
Expected: build succeeds with no import/reference errors.

Run inside `backend/` (this project uses ES modules — `"type": "module"` in
`backend/package.json` — so a plain `node -e "require(...)"` won't work;
use dynamic `import()` instead):
```bash
node --input-type=module -e "import('./controllers/authController.js').then(() => console.log('OK')).catch(e => { console.error(e); process.exit(1); })"
```
Expected: prints `OK` with no import errors (confirms the new `twilio`
import resolves and the file has no syntax errors). Restarting the dev
server (`npm run dev`) and confirming it starts cleanly is an equally
valid way to check this, if simpler in this environment.

- [ ] **Step 7: Verify end-to-end (real test, if Twilio trial credentials are available in this session)**

If you can sign up for a Twilio free trial account within this session (it takes a few minutes and provides free trial credit) and set real `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`/`TWILIO_PHONE_NUMBER` in this worktree's `backend/.env`, do the full real test: run the backend and frontend dev servers, click "Continue with Phone" on `/login`, enter a real phone number you can receive an SMS on (a Twilio trial account can only send to phone numbers you've verified in the Twilio console — verify one first if needed), confirm a real SMS arrives with a 6-digit code, enter it on the `/otp` page, and confirm it logs you in.

If real Twilio credentials aren't available in this environment, that's an acceptable, explicitly-reported gap (per the plan's Global Constraints) — instead verify what's checkable without them:
1. Confirm `sendPhoneOTP` returns `{"success":false,"message":"SMS delivery is not configured"}` when Twilio env vars are unset (matches the guarded `twilioClient` check in Step 2) — this itself proves the code no longer silently fakes success or leaks a code.
2. Using the `run` skill, click "Continue with Phone" on `/login` and `/register`, confirm the custom prompt dialog (not a native `prompt()`) appears asking for a phone number, confirm cancelling it does nothing, and confirm submitting a phone number results in the "SMS delivery is not configured" toast (proving the frontend correctly calls the backend and surfaces its error) rather than a silent failure or a crash.

Report explicitly which of the two verification paths you took and why.

- [ ] **Step 8: Commit**

```bash
git add backend/controllers/authController.js backend/package.json backend/package-lock.json backend/.env.example frontend/src/pages/auth/LoginPage.jsx frontend/src/pages/auth/RegisterPage.jsx frontend/src/pages/auth/OTPPage.jsx
git commit -m "feat: wire up phone sign-in with real Twilio SMS delivery"
```

---

## Task 3: Facebook sign-in

**Files:**
- Modify: `backend/controllers/authController.js`
- Modify: `backend/.env.example`
- Create: `frontend/src/lib/facebookAuth.js`
- Modify: `frontend/.env.example`
- Modify: `frontend/src/pages/auth/LoginPage.jsx`
- Modify: `frontend/src/pages/auth/RegisterPage.jsx`

**Interfaces:**
- Consumes/extends: `PROVIDER_VERIFIERS` (Task 1) — adds a `facebook` entry.
- Consumes/extends: `handleOAuth(provider)` (Task 1) — adds one `if (provider === 'facebook')` branch.
- Produces: `export const triggerFacebookLogin = async () => Promise<accessToken: string>` from `frontend/src/lib/facebookAuth.js`.

- [ ] **Step 1: Add `verifyFacebookToken` and register it in `backend/controllers/authController.js`**

Add this function directly above the `PROVIDER_VERIFIERS` declaration (which Task 1 created):
```js
const verifyFacebookToken = async (accessToken) => {
  const appToken = `${process.env.FACEBOOK_APP_ID}|${process.env.FACEBOOK_APP_SECRET}`;
  const debugRes = await fetch(`https://graph.facebook.com/debug_token?input_token=${accessToken}&access_token=${appToken}`);
  const debug = await debugRes.json();
  if (!debug.data?.is_valid || debug.data.app_id !== process.env.FACEBOOK_APP_ID) {
    throw new Error('Invalid Facebook token');
  }

  const profileRes = await fetch(`https://graph.facebook.com/me?fields=id,name,email,picture&access_token=${accessToken}`);
  const profile = await profileRes.json();

  return { providerId: profile.id, email: profile.email, fullName: profile.name, avatar: profile.picture?.data?.url };
};
```

Change:
```js
const PROVIDER_VERIFIERS = {
  google: verifyGoogleToken,
};
```
to:
```js
const PROVIDER_VERIFIERS = {
  google: verifyGoogleToken,
  facebook: verifyFacebookToken,
};
```

- [ ] **Step 2: Add Facebook env var placeholders**

In `backend/.env.example`, add:
```
# Facebook Login (https://developers.facebook.com/apps)
FACEBOOK_APP_ID=your_facebook_app_id
FACEBOOK_APP_SECRET=your_facebook_app_secret
```

In `frontend/.env.example`, add:
```
VITE_FACEBOOK_APP_ID=your_facebook_app_id
```

- [ ] **Step 3: Create `frontend/src/lib/facebookAuth.js`**

```js
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
```

- [ ] **Step 4: Wire up the Facebook button on both pages**

In `frontend/src/pages/auth/LoginPage.jsx`, add:
```js
import { triggerFacebookLogin } from '../../lib/facebookAuth';
```
In `handleOAuth`, insert this branch right before the final fallback toast (after the `if (provider === 'phone') {...}` branch from Task 2, or right after the `if (provider === 'google') {...}` branch if Task 2 hasn't landed yet — either position is correct, just before the final `toast('OAuth requires backend configuration', ...)` line):
```js
  if (provider === 'facebook') {
    try {
      const accessToken = await triggerFacebookLogin();
      const data = await oauthLogin(provider, { token: accessToken });
      if (data.requiresTwoFactor) {
        navigate('/otp', { state: { userId: data.userId, purpose: '2fa' } });
        return;
      }
      toast.success('Welcome!');
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Facebook sign-in failed');
    }
    return;
  }
```

Apply the identical change (the import, the `if (provider === 'facebook')` branch — using `toast.success('Welcome to NexVibe!');` instead of `'Welcome!'` and no `requiresTwoFactor` check, matching `RegisterPage.jsx`'s existing Google branch style from Task 1) to `frontend/src/pages/auth/RegisterPage.jsx`.

- [ ] **Step 5: Verify it builds**

Run inside `frontend/`:
```bash
npm run build
```
Expected: build succeeds with no import/reference errors.

- [ ] **Step 6: Verify what's checkable without real Facebook credentials**

Using the `run` skill against `npm run dev`, click "Continue with Facebook" on `/login` and `/register`, confirm (via the Network tab) a request to `connect.facebook.net/en_US/sdk.js` fires. Test the backend rejection path directly:
```bash
curl -s -X POST http://localhost:5000/api/auth/oauth -H "Content-Type: application/json" -d '{"provider":"facebook","token":"not-a-real-token"}'
```
Expected: `{"success":false,"message":"Could not verify identity with provider"}`, 401.

Report explicitly that full success-path testing requires the user to supply real `FACEBOOK_APP_ID`/`FACEBOOK_APP_SECRET`/`VITE_FACEBOOK_APP_ID` values first, and that Meta additionally requires app review before "email" permission works for non-test users in production (test users added in the Meta developer console work without review).

- [ ] **Step 7: Commit**

```bash
git add backend/controllers/authController.js backend/.env.example frontend/src/lib/facebookAuth.js frontend/.env.example frontend/src/pages/auth/LoginPage.jsx frontend/src/pages/auth/RegisterPage.jsx
git commit -m "feat: wire up functional Facebook sign-in with server-side token verification"
```

---

## Task 4: Apple sign-in

**Files:**
- Modify: `backend/controllers/authController.js`
- Modify: `backend/package.json` (add `apple-signin-auth` dependency)
- Modify: `backend/.env.example`
- Create: `frontend/src/lib/appleAuth.js`
- Modify: `frontend/.env.example`
- Modify: `frontend/src/pages/auth/LoginPage.jsx`
- Modify: `frontend/src/pages/auth/RegisterPage.jsx`

**Interfaces:**
- Consumes/extends: `PROVIDER_VERIFIERS` (Task 1) — adds an `apple` entry.
- Consumes/extends: `handleOAuth(provider)` (Task 1) — adds one `if (provider === 'apple')` branch, the one that sends `fullName` alongside `token`.
- Produces: `export const triggerAppleLogin = async () => Promise<{ idToken: string, fullName: string | undefined }>` from `frontend/src/lib/appleAuth.js`.

- [ ] **Step 1: Install `apple-signin-auth`**

Run inside `backend/`:
```bash
npm install apple-signin-auth
```

- [ ] **Step 2: Add `verifyAppleToken` and register it in `backend/controllers/authController.js`**

Add the import near the top of the file:
```js
import appleSignin from 'apple-signin-auth';
```

Add this function directly above the `PROVIDER_VERIFIERS` declaration:
```js
const verifyAppleToken = async (idToken) => {
  const payload = await appleSignin.verifyIdToken(idToken, {
    audience: process.env.APPLE_CLIENT_ID,
  });
  return { providerId: payload.sub, email: payload.email, fullName: undefined, avatar: undefined };
};
```

Change:
```js
const PROVIDER_VERIFIERS = {
  google: verifyGoogleToken,
  facebook: verifyFacebookToken,
};
```
to:
```js
const PROVIDER_VERIFIERS = {
  google: verifyGoogleToken,
  facebook: verifyFacebookToken,
  apple: verifyAppleToken,
};
```
(If Task 3 hasn't landed yet when this task runs, the map will only have `google` in it — just add `apple` to whatever the map currently contains, same pattern either way.)

- [ ] **Step 3: Add Apple env var placeholder**

In `backend/.env.example`, add:
```
# Sign in with Apple (Services ID, from https://developer.apple.com/account/resources/identifiers)
APPLE_CLIENT_ID=your_apple_services_id
```

In `frontend/.env.example`, add:
```
VITE_APPLE_CLIENT_ID=your_apple_services_id
```

- [ ] **Step 4: Create `frontend/src/lib/appleAuth.js`**

```js
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
```

- [ ] **Step 5: Wire up the Apple button on both pages**

In `frontend/src/pages/auth/LoginPage.jsx`, add:
```js
import { triggerAppleLogin } from '../../lib/appleAuth';
```
In `handleOAuth`, insert this branch right before the final fallback toast:
```js
  if (provider === 'apple') {
    try {
      const { idToken, fullName } = await triggerAppleLogin();
      const data = await oauthLogin(provider, { token: idToken, fullName });
      if (data.requiresTwoFactor) {
        navigate('/otp', { state: { userId: data.userId, purpose: '2fa' } });
        return;
      }
      toast.success('Welcome!');
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Apple sign-in failed');
    }
    return;
  }
```

Apply the identical change (the import, the `if (provider === 'apple')` branch, matching `RegisterPage.jsx`'s existing branch style — `toast.success('Welcome to NexVibe!');`, no `requiresTwoFactor` check) to `frontend/src/pages/auth/RegisterPage.jsx`.

- [ ] **Step 6: Verify it builds**

Run inside `frontend/`:
```bash
npm run build
```
Expected: build succeeds with no import/reference errors.

- [ ] **Step 7: Verify what's checkable without real Apple credentials**

Using the `run` skill against `npm run dev`, click "Continue with Apple" on `/login` and `/register`, confirm (via the Network tab) a request to `appleid.cdn-apple.com/.../appleid.auth.js` fires. Test the backend rejection path directly:
```bash
curl -s -X POST http://localhost:5000/api/auth/oauth -H "Content-Type: application/json" -d '{"provider":"apple","token":"not-a-real-token"}'
```
Expected: `{"success":false,"message":"Could not verify identity with provider"}`, 401 (confirms `apple-signin-auth`'s JWKS-based signature check correctly rejects a non-JWT/garbage string rather than crashing).

Report explicitly that full success-path testing requires the user to have a paid Apple Developer Program membership and a configured Services ID (`APPLE_CLIENT_ID`) first, and that this is the one provider where that's a hard prerequisite rather than a fast free signup.

- [ ] **Step 8: Commit**

```bash
git add backend/controllers/authController.js backend/package.json backend/package-lock.json backend/.env.example frontend/src/lib/appleAuth.js frontend/.env.example frontend/src/pages/auth/LoginPage.jsx frontend/src/pages/auth/RegisterPage.jsx
git commit -m "feat: wire up functional Apple sign-in with server-side token verification"
```
