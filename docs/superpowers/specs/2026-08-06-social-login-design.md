# Google / Phone / Facebook / Apple Sign-in — Design

## Problem

None of the "Continue with Google/Facebook/Apple/Phone" buttons on
`LoginPage.jsx`/`RegisterPage.jsx` do anything real:

- Google/Facebook/Apple buttons call `handleOAuth(provider)`, which just
  shows `toast('OAuth requires backend configuration')`.
- The backend already has `POST /api/auth/oauth` (`oauthLogin` in
  `authController.js`) and a frontend `oauthLogin()` in `AuthContext.jsx`
  wired to call it — but the endpoint **blindly trusts whatever `provider`,
  `providerId`, `email`, `fullName` the client sends**, with zero
  verification against the actual provider. As written, anyone can POST
  directly to this endpoint claiming to be any email address and receive a
  valid session for that account — a real account-takeover hole, not just
  an unfinished feature.
- Phone: `LoginPage`'s phone button navigates to `/register?method=phone`,
  which `RegisterPage.jsx` doesn't read at all (its own phone button is
  lumped into the same stub-toast list). The backend's `sendPhoneOTP` is an
  explicit stub — comment reads `// In production, integrate with Twilio or
  similar`, generates a fake code, and for new numbers **returns the OTP in
  the JSON response** instead of sending an SMS. No SMS provider exists
  anywhere in this codebase.
- Bonus bug found while reading these two files: `FiEyeInvisible` is
  referenced (password-reveal toggle) in both `LoginPage.jsx` and
  `RegisterPage.jsx` but never imported — `react-icons/fi` doesn't even
  have that name (Feather's icon is `FiEyeOff`). Clicking the eye icon to
  reveal a typed password currently throws `ReferenceError` and crashes
  that part of the UI.

## Goals

- All four buttons work for both sign-up and sign-in, on both pages
  (identical behavior on Login and Register — like every real app, the
  underlying action is "log me in with X, creating an account on first
  use").
- Every identity claim is verified server-side against the actual
  provider before an account is created or a session is issued — closes
  the impersonation hole described above.
- Phone OTP is sent through a real SMS provider (Twilio) and the code is
  never present in any API response.
- Fix the `FiEyeInvisible` → `FiEyeOff` bug on both pages while touching
  this file for the OAuth wiring (same file, same section, trivial,
  otherwise the password toggle stays broken).

## Non-goals

- Twitter/X ("Continue with X") stays a stub — not requested, not part of
  this change.
- No new frontend npm dependencies. Each provider's JS SDK is lazy-loaded
  via a `<script>` tag only when its button is clicked, matching a single
  consistent pattern across Google/Facebook/Apple rather than mixing an
  npm-wrapped library for one provider with manual script loading for the
  others.
- No change to the existing account find-or-create logic in `oauthLogin`
  (find by `{provider}Id`, then by `email`, then create) — only how the
  identity fed into that logic is obtained (verified against the provider,
  not trusted from the client).
- No Apple refresh-token / server-to-server token exchange — only the
  client-obtained `id_token` is verified (via Apple's public JWKS), which
  is sufficient for sign-in. This avoids needing `APPLE_TEAM_ID`,
  `APPLE_KEY_ID`, or the private `.p8` key at all.
- Backend's `helmet()` CSP does not need to change — it only applies to
  responses the Express server itself sends (API JSON, `/uploads`). The
  actual frontend page is a separately-hosted Vite SPA with no CSP meta
  tag, so loading Google/Facebook/Apple's SDK scripts from the browser is
  unaffected by it.

## Environment variables

Backend (`backend/.env`, `.env.example` already has the Google two —
`GOOGLE_CLIENT_SECRET` turns out to be unused by the design below and can
stay as a documented-but-unused placeholder for forward-compatibility, or
be removed; not touched either way by this change):

```
GOOGLE_CLIENT_ID=
FACEBOOK_APP_ID=
FACEBOOK_APP_SECRET=
APPLE_CLIENT_ID=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
```

Frontend (`frontend/.env`, new file — Vite exposes only `VITE_`-prefixed
vars to client code):

```
VITE_GOOGLE_CLIENT_ID=
VITE_FACEBOOK_APP_ID=
VITE_APPLE_CLIENT_ID=
```

Client IDs are public by design (they identify the app, not authenticate
it) — safe to ship in the frontend bundle. Secrets (`FACEBOOK_APP_SECRET`,
Twilio credentials) stay backend-only.

## Backend — shared dispatcher

### `backend/controllers/authController.js` — `oauthLogin` rewrite

Request body changes from `{ provider, providerId, email, fullName,
avatar, username }` (all client-claimed) to `{ provider, token }` (one
opaque string, meaning depends on `provider`).

```js
const PROVIDER_VERIFIERS = {
  google: verifyGoogleToken,
  facebook: verifyFacebookToken,
  apple: verifyAppleToken,
};

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
    // ONLY for provider === 'apple', and only as a fallback name for a
    // brand-new account, never to override providerId/email.
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

`verifyGoogleToken`/`verifyFacebookToken`/`verifyAppleToken` are added
task-by-task (Google's task adds the dispatcher shape above with only
`google` wired and the other two provider buttons still hitting the old
stub toast; Facebook's and Apple's tasks each add one function and one
`PROVIDER_VERIFIERS` entry — no structural change at that point).

## Task-by-task provider details

### 1. Google

**`backend/controllers/authController.js`**: add
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
```
Uses Node's native `fetch` (Node 18+, already the runtime here) — no new
backend dependency for Google.

**`frontend/src/lib/googleAuth.js`** (new) — lazy-loads
`https://accounts.google.com/gsi/client`, then wraps
`google.accounts.oauth2.initTokenClient` in a Promise so a button's
`onClick` can just `await triggerGoogleLogin()` and get back an access
token string.

**`LoginPage.jsx` / `RegisterPage.jsx`**: `handleOAuth('google')` calls
`triggerGoogleLogin()`, then `oauthLogin('google', { token: accessToken })`
(the `AuthContext.oauthLogin` signature changes from spreading arbitrary
`providerData` to just passing `{ token }, so build `authAPI.oauthLogin({
provider, token })` directly instead), then on success `toast.success` +
navigate `/` — matching the existing password-login success path. Also
fixes the `FiEyeInvisible` → `FiEyeOff` bug in both files while here.

### 2. Phone

**`backend/controllers/authController.js`** — `sendPhoneOTP` rewrite:
never returns the OTP; creates a new (unverified) user immediately for
unseen numbers, same account-creation-on-first-contact pattern `oauthLogin`
already uses, so the OTP has somewhere to live and `verifyOTP` needs no new
branch for "no user yet":
```js
export const sendPhoneOTP = async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ success: false, message: 'Phone number required' });

    let user = await User.findOne({ phone });
    if (!user) {
      let username = `user${Date.now()}`;
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
(`user.generateOTP(purpose)` is the same existing `User` model method
already used by register/login/2FA — confirmed it sets `otp`/`otpExpiry`
and returns the plaintext code, matching this usage.)

New `backend/utils/twilio.js` (or inline in `authController.js` — small
enough either way, plan decides) exports a configured
`twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)` client.

**`backend/controllers/authController.js`** — `verifyOTP`: add
`'phone_login'` to the existing purpose check that issues a token
(`purpose === 'register' || purpose === '2fa' || purpose === 'login'` →
add `|| purpose === 'phone_login'`), and additionally set
`user.isPhoneVerified = true` on that branch specifically for phone
purposes.

**Frontend**: `handleOAuth('phone')` on both pages calls
`usePrompt()` (`DialogContext`, already built) with `{ title: 'Enter your
phone number', inputPlaceholder: '+1 234 567 8900' }` instead of a native
prompt or a new modal component; on a non-null result calls
`authAPI.sendPhoneOTP(phone)`, then `navigate('/otp', { state: { userId:
data.userId, purpose: 'phone_login', phone } })` — reusing the existing
`OTPPage.jsx` verbatim except its hardcoded "We sent a 6-digit code to
{email}" text needs an `phone` fallback (`state?.phone || state?.email ||
'your email'`).

### 3. Facebook

**`backend/controllers/authController.js`**: add
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

**`frontend/src/lib/facebookAuth.js`** (new) — lazy-loads the Facebook JS
SDK (`connect.facebook.net/en_US/sdk.js`), calls `FB.init({ appId:
import.meta.env.VITE_FACEBOOK_APP_ID, version: 'v19.0' })` once, wraps
`FB.login(callback, { scope: 'email' })` in a Promise returning
`authResponse.accessToken`.

**`LoginPage.jsx`/`RegisterPage.jsx`**: `handleOAuth('facebook')` follows
the same shape as Google's branch.

### 4. Apple

**`backend/controllers/authController.js`**: add (using the new
`apple-signin-auth` dependency)
```js
import appleSignin from 'apple-signin-auth';
// ...
const verifyAppleToken = async (idToken) => {
  const payload = await appleSignin.verifyIdToken(idToken, {
    audience: process.env.APPLE_CLIENT_ID,
  });
  return { providerId: payload.sub, email: payload.email, fullName: undefined, avatar: undefined };
};
```
Apple only ever provides `fullName` in the *first* `signIn()` response
object (not in the `id_token` itself, and never again on subsequent
sign-ins) — the frontend passes it through as an extra field only on that
first call; `oauthLogin`'s `fullName || 'New User'` fallback already
handles the "not available" case cleanly, so no special-casing needed
server-side.

**`backend/package.json`**: add `apple-signin-auth` dependency.

**`frontend/src/lib/appleAuth.js`** (new) — lazy-loads
`https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js`,
calls `AppleID.auth.init({ clientId: import.meta.env.VITE_APPLE_CLIENT_ID,
scope: 'name email', redirectURI: window.location.origin, usePopup: true
})`, wraps `AppleID.auth.signIn()` in a Promise returning `{ idToken,
fullName }` (`fullName` derived from `response.user?.name` when present,
joining `firstName`/`lastName` if both given).

**`LoginPage.jsx`/`RegisterPage.jsx`**: `handleOAuth('apple')` follows the
same shape, passing `{ provider: 'apple', token: idToken, fullName }` — the
one documented exception to the shared `{ provider, token }` body, since
Apple is the only provider that ever hands a display name to the client
instead of embedding it in the verifiable token, and only on a user's
very first sign-in. `oauthLogin` reads `req.body.fullName` and, **only**
when `provider === 'apple'`, passes it through to the `fullName || 'New
User'` fallback already in the create-user branch — it never overrides an
already-verified `providerId`/`email`, so a client-supplied name can only
make a genuinely-new account's display name nicer than "New User", never
impersonate an existing one.

## Testing

- Backend: manual `curl`/token tests are not meaningful here without real
  provider credentials — verification happens by actually clicking each
  button in a browser once its env vars are filled in.
- Since real credentials arrive from the user after this plan lands, each
  task's live-browser check is scoped to what's checkable **without**
  real credentials: the button triggers the right SDK load, the network
  request to the backend has the right shape, and the backend correctly
  rejects an invalid/fake token with 401 rather than crashing or silently
  creating an account. Full success-path testing (does a *real* Google
  login round-trip correctly) happens once the user supplies credentials
  and is called out explicitly as a follow-up, not blocking merge of each
  task.
- Phone is the one flow fully testable today without new external
  credentials the user has to obtain interactively — Twilio's free trial
  can be signed up for in minutes, so its task's live-verification step
  should attempt the real end-to-end path if credentials are available in
  the implementation session, and clearly report if they aren't.
