import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { userAPI, authAPI } from '../../services/api';
import Avatar from '../../components/common/Avatar';
import { permissionLabel } from '../../lib/permissionLabel';
import toast from 'react-hot-toast';
import { FiArrowLeft, FiCamera, FiCheck, FiMic, FiBell, FiHardDrive } from 'react-icons/fi';

const SECTIONS = [
  { key: 'profile', label: 'Edit profile' },
  { key: 'account', label: 'Account' },
  { key: 'privacy', label: 'Privacy' },
  { key: 'security', label: 'Security' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'app', label: 'App' },
  { key: 'blocked', label: 'Blocked accounts' },
  { key: 'help', label: 'Help' },
];

export default function SettingsPage() {
  const { section = 'profile' } = useParams();
  const { user, updateUser, logout } = useAuth();
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState(section);
  const [mobileShowSection, setMobileShowSection] = useState(!!section && section !== 'profile');

  const handleNav = (key) => {
    setActiveSection(key);
    setMobileShowSection(true);
    navigate(`/settings/${key}`);
  };

  return (
    <div className="max-w-[935px] mx-auto flex min-h-screen border-x border-[var(--border)]">
      <div className={`w-full md:w-[240px] flex-shrink-0 border-r border-[var(--border)] ${mobileShowSection ? 'hidden md:block' : 'block'}`}>
        <div className="px-4 py-6">
          <h2 className="text-xl font-bold mb-6 px-2">Settings</h2>
          <nav className="space-y-0.5">
            {SECTIONS.map(s => (
              <button key={s.key} onClick={() => handleNav(s.key)}
                className={`w-full text-left px-3 py-3 rounded-xl text-sm font-medium transition-colors ${activeSection === s.key ? 'bg-[var(--bg-tertiary)] font-semibold' : 'hover:bg-[var(--bg-tertiary)]'}`}>
                {s.label}
              </button>
            ))}
            <button onClick={logout} className="w-full text-left px-3 py-3 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors mt-4">
              Log out
            </button>
          </nav>
        </div>
      </div>

      <div className={`flex-1 ${mobileShowSection ? 'block' : 'hidden md:block'}`}>
        <div className="flex items-center gap-3 px-6 py-4 border-b border-[var(--border)] md:hidden">
          <button onClick={() => { setMobileShowSection(false); navigate('/settings'); }}>
            <FiArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="font-bold">{SECTIONS.find(s => s.key === activeSection)?.label}</h2>
        </div>
        <div className="px-6 py-6">
          {activeSection === 'profile' && <EditProfileSection user={user} updateUser={updateUser} />}
          {activeSection === 'account' && <AccountSection user={user} updateUser={updateUser} navigate={navigate} logout={logout} />}
          {activeSection === 'privacy' && <PrivacySection user={user} updateUser={updateUser} />}
          {activeSection === 'security' && <SecuritySection user={user} />}
          {activeSection === 'notifications' && <NotificationsSection user={user} updateUser={updateUser} />}
          {activeSection === 'app' && <AppPermissionsSection />}
          {activeSection === 'blocked' && <BlockedSection />}
          {activeSection === 'help' && <HelpSection />}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="border border-[var(--border)] rounded-2xl p-5 mb-5">
      <h3 className="font-bold text-sm mb-4">{title}</h3>
      {children}
    </div>
  );
}

function ToggleRow({ label, desc, value, onChange }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-[var(--border)] last:border-0 gap-4">
      <div className="flex-1">
        <p className="text-sm font-medium">{label}</p>
        {desc && <p className="text-xs text-[var(--text-muted)] mt-0.5 leading-relaxed">{desc}</p>}
      </div>
      <button onClick={() => onChange(!value)}
        className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${value ? 'bg-blue-500' : 'bg-[var(--bg-tertiary)] border border-[var(--border)]'}`}>
        <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${value ? 'translate-x-6' : 'translate-x-0.5'}`} />
      </button>
    </div>
  );
}

function EditProfileSection({ user, updateUser }) {
  const [form, setForm] = useState({ fullName: user?.fullName || '', username: user?.username || '', bio: user?.bio || '', website: user?.website || '', gender: user?.gender || '', pronouns: user?.pronouns || '' });
  const [loading, setLoading] = useState(false);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const avatarRef = useRef(null);

  const handleSave = async () => {
    setLoading(true);
    try { const { data } = await userAPI.updateProfile(form); updateUser(data.user); toast.success('Profile saved'); }
    catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setLoading(false); }
  };

  const handleAvatar = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    setAvatarLoading(true);
    try { const fd = new FormData(); fd.append('avatar', file); const { data } = await userAPI.updateAvatar(fd); updateUser({ avatar: data.avatar }); toast.success('Photo updated'); }
    catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setAvatarLoading(false); }
  };

  return (
    <div className="max-w-[500px] space-y-5">
      <h2 className="text-xl font-bold hidden md:block">Edit profile</h2>
      <div className="flex items-center gap-5 bg-[var(--bg-tertiary)] rounded-2xl p-4">
        <div className="relative">
          <Avatar src={user?.avatar} size={56} alt={user?.fullName} />
          {avatarLoading && <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center"><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /></div>}
        </div>
        <div>
          <p className="font-semibold text-sm">{user?.username}</p>
          <button onClick={() => avatarRef.current?.click()} className="text-sm font-semibold text-blue-500 hover:text-blue-600">Change photo</button>
          <input ref={avatarRef} type="file" accept="image/*" onChange={handleAvatar} className="hidden" />
        </div>
      </div>
      {[{ label: 'Full name', key: 'fullName', max: 50 }, { label: 'Username', key: 'username', max: 30 }, { label: 'Website', key: 'website' }].map(({ label, key, max }) => (
        <div key={key}>
          <label className="block text-sm font-semibold mb-1.5">{label}</label>
          <input value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} maxLength={max} className="input-field" />
        </div>
      ))}
      <div>
        <label className="block text-sm font-semibold mb-1.5">Bio</label>
        <textarea value={form.bio} onChange={e => setForm(p => ({ ...p, bio: e.target.value }))} maxLength={150} rows={4} className="input-field resize-none" />
        <p className="text-xs text-[var(--text-muted)] mt-1 text-right">{form.bio?.length || 0}/150</p>
      </div>
      <div>
        <label className="block text-sm font-semibold mb-1.5">Gender</label>
        <select value={form.gender} onChange={e => setForm(p => ({ ...p, gender: e.target.value }))} className="input-field">
          <option value="">Prefer not to say</option>
          <option value="Male">Male</option>
          <option value="Female">Female</option>
          <option value="Non-binary">Non-binary</option>
        </select>
      </div>
      <button onClick={handleSave} disabled={loading} className="btn-primary w-full py-2.5 rounded-xl">{loading ? 'Saving...' : 'Save changes'}</button>
    </div>
  );
}

function AccountSection({ user, updateUser, navigate, logout }) {
  const [loading, setLoading] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [password, setPassword] = useState('');

  return (
    <div className="max-w-[500px] space-y-5">
      <h2 className="text-xl font-bold hidden md:block">Account</h2>
      <Section title="Account type">
        {['personal','creator','business'].map(type => (
          <label key={type} className="flex items-center justify-between py-2 cursor-pointer">
            <span className="text-sm capitalize">{type} account</span>
            <input type="radio" name="accountType" value={type} defaultChecked={user?.accountType === type}
              onChange={async () => { await userAPI.updateAccountType(type); updateUser({ accountType: type }); toast.success('Updated'); }} className="w-4 h-4 accent-blue-500" />
          </label>
        ))}
      </Section>
      <Section title="Email">
        <p className="text-sm text-[var(--text-muted)] mb-2">{user?.email}</p>
        <button onClick={() => navigate('/settings/security')} className="text-sm font-semibold text-blue-500">Change email</button>
      </Section>
      <Section title="Delete account">
        <p className="text-sm text-[var(--text-secondary)] mb-4">Once deleted, your account and all data will be permanently removed.</p>
        <button onClick={() => setShowDelete(v => !v)} className="w-full py-3 px-4 rounded-xl text-sm font-medium border border-red-300 dark:border-red-800 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors">
          Delete account permanently
        </button>
        {showDelete && (
          <div className="mt-3 space-y-2 bg-[var(--bg-tertiary)] rounded-xl p-4">
            <p className="text-sm text-red-500 font-medium">This cannot be undone.</p>
            <input type="password" placeholder="Enter your password" value={password} onChange={e => setPassword(e.target.value)} className="input-field" />
            <div className="flex gap-2">
              <button onClick={() => setShowDelete(false)} className="btn-outline flex-1 text-sm py-2">Cancel</button>
              <button onClick={async () => { try { await userAPI.deleteAccount(password); logout(); } catch (err) { toast.error(err.response?.data?.message || 'Failed'); } }} className="flex-1 py-2 bg-red-500 text-white rounded-lg text-sm font-semibold">Delete forever</button>
            </div>
          </div>
        )}
      </Section>
    </div>
  );
}

function PrivacySection({ user, updateUser }) {
  const [settings, setSettings] = useState(user?.settings?.privacy || {});
  const [isPrivate, setIsPrivate] = useState(user?.isPrivate || false);
  const handle = async (key, value) => {
    const u = { ...settings, [key]: value }; setSettings(u);
    try { await userAPI.updatePrivacy({ ...u, isPrivate }); updateUser({ settings: { ...user.settings, privacy: u } }); }
    catch { toast.error('Failed'); }
  };
  const handlePrivate = async () => {
    const v = !isPrivate; setIsPrivate(v);
    try { await userAPI.updatePrivacy({ isPrivate: v }); updateUser({ isPrivate: v }); toast.success(v ? 'Account is now private' : 'Account is now public'); }
    catch { toast.error('Failed'); }
  };
  return (
    <div className="max-w-[500px]">
      <h2 className="text-xl font-bold hidden md:block mb-5">Privacy</h2>
      <Section title="Account privacy">
        <ToggleRow label="Private account" desc="Only approved followers can see your photos and videos." value={isPrivate} onChange={handlePrivate} />
      </Section>
      <Section title="Interactions">
        <ToggleRow label="Show activity status" desc="Let followers see when you were last active." value={settings.activityStatus} onChange={v => handle('activityStatus', v)} />
        <ToggleRow label="Show online status" desc="Let followers see when you are currently online." value={settings.showOnlineStatus} onChange={v => handle('showOnlineStatus', v)} />
        <ToggleRow label="Hide like counts" desc="Only you will see the total number of likes on your posts." value={settings.hideLikeCount} onChange={v => handle('hideLikeCount', v)} />
      </Section>
    </div>
  );
}

function SecuritySection({ user }) {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPwd: '' });
  const [loading, setLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');

  const handleChangePwd = async (e) => {
    e.preventDefault();
    if (form.newPassword !== form.confirmPwd) return toast.error("Passwords don't match");
    if (form.newPassword.length < 8) return toast.error('Min 8 characters');
    setLoading(true);
    try { await authAPI.changePassword({ currentPassword: form.currentPassword, newPassword: form.newPassword }); toast.success('Password changed'); setForm({ currentPassword: '', newPassword: '', confirmPwd: '' }); }
    catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setLoading(false); }
  };

  return (
    <div className="max-w-[500px]">
      <h2 className="text-xl font-bold hidden md:block mb-5">Security</h2>
      <Section title="Change password">
        <form onSubmit={handleChangePwd} className="space-y-3">
          <input type="password" placeholder="Current password" value={form.currentPassword} onChange={e => setForm(p => ({ ...p, currentPassword: e.target.value }))} className="input-field" />
          <input type="password" placeholder="New password" value={form.newPassword} onChange={e => setForm(p => ({ ...p, newPassword: e.target.value }))} className="input-field" />
          <input type="password" placeholder="Confirm new password" value={form.confirmPwd} onChange={e => setForm(p => ({ ...p, confirmPwd: e.target.value }))} className="input-field" />
          <button type="submit" disabled={loading} className="btn-primary w-full py-2.5 rounded-xl">{loading ? 'Saving...' : 'Change password'}</button>
        </form>
      </Section>
      <Section title="Two-factor authentication">
        <p className="text-sm text-[var(--text-secondary)] mb-4">Add an extra layer of security with email OTP verification on every new login.</p>
        {!otpSent ? (
          <button onClick={async () => { try { await authAPI.request2FAOTP(); setOtpSent(true); toast.success('OTP sent'); } catch { toast.error('Failed'); } }}
            className={`px-4 py-2 rounded-xl text-sm font-semibold border ${user?.twoFactorEnabled ? 'border-red-300 text-red-500' : 'border-blue-300 text-blue-500'}`}>
            {user?.twoFactorEnabled ? 'Disable 2FA' : 'Enable 2FA'}
          </button>
        ) : (
          <div className="space-y-2">
            <input type="text" placeholder="6-digit OTP" value={otp} onChange={e => setOtp(e.target.value)} maxLength={6} className="input-field" />
            <button onClick={async () => { try { await authAPI.toggle2FA({ enable: !user?.twoFactorEnabled, otp }); toast.success('Done'); setOtpSent(false); } catch (err) { toast.error(err.response?.data?.message || 'Invalid OTP'); } }}
              disabled={otp.length !== 6} className="btn-primary w-full py-2 rounded-xl text-sm disabled:opacity-50">Confirm</button>
          </div>
        )}
      </Section>
    </div>
  );
}

function NotificationsSection({ user, updateUser }) {
  const [settings, setSettings] = useState(user?.settings?.notifications || {});
  const handle = async (key, value) => {
    const u = { ...settings, [key]: value }; setSettings(u);
    try { await userAPI.updateNotifications(u); updateUser({ settings: { ...user.settings, notifications: u } }); }
    catch { toast.error('Failed'); }
  };
  const items = [
    { key: 'likes', label: 'Likes' }, { key: 'comments', label: 'Comments' },
    { key: 'follows', label: 'Follows' }, { key: 'messages', label: 'Messages' },
    { key: 'mentions', label: 'Mentions & Tags' }, { key: 'stories', label: 'Story activity' },
    { key: 'emailNotifications', label: 'Email notifications' },
  ];
  return (
    <div className="max-w-[500px]">
      <h2 className="text-xl font-bold hidden md:block mb-5">Notifications</h2>
      <div className="border border-[var(--border)] rounded-2xl divide-y divide-[var(--border)] overflow-hidden">
        {items.map(item => <ToggleRow key={item.key} label={item.label} value={settings[item.key]} onChange={v => handle(item.key, v)} />)}
      </div>
    </div>
  );
}

function PermissionRow({ icon, label, state, onTest }) {
  const { text, className } = permissionLabel(state);
  return (
    <div className="flex items-center justify-between py-3 border-b border-[var(--border)] last:border-0 gap-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center text-[var(--text-secondary)]">{icon}</div>
        <div>
          <p className="text-sm font-medium">{label}</p>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium inline-block mt-0.5 ${className}`}>{text}</span>
        </div>
      </div>
      {state === 'denied' ? (
        <p className="text-xs text-[var(--text-muted)] max-w-[160px] text-right">Blocked in browser settings</p>
      ) : (
        <button onClick={onTest} className="text-sm font-semibold text-blue-500 hover:text-blue-600 flex-shrink-0">Test</button>
      )}
    </div>
  );
}

function AppPermissionsSection() {
  const [camera, setCamera] = useState('unsupported');
  const [mic, setMic] = useState('unsupported');
  const [notifications, setNotifications] = useState(() => {
    if (typeof Notification === 'undefined') return 'unsupported';
    return Notification.permission === 'default' ? 'prompt' : Notification.permission;
  });
  const [storage, setStorage] = useState('unsupported');

  useEffect(() => {
    const readState = async (name, setter) => {
      try {
        if (!navigator.permissions?.query) return;
        const status = await navigator.permissions.query({ name });
        setter(status.state);
      } catch {
        // Safari doesn't support querying camera/microphone this way;
        // state stays 'unsupported' until the user clicks Test.
      }
    };
    readState('camera', setCamera);
    readState('microphone', setMic);
    if (navigator.storage?.persisted) {
      navigator.storage.persisted().then((persisted) => setStorage(persisted ? 'granted' : 'prompt'));
    }
  }, []);

  const testMedia = async (kind, setter) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ [kind]: true });
      stream.getTracks().forEach((track) => track.stop());
      setter('granted');
    } catch (error) {
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        setter('denied');
      } else {
        // NotFoundError (no device), NotReadableError (device busy elsewhere),
        // OverconstrainedError, etc. are transient/environmental, not a real
        // permission denial — keep the Test button available for retry.
        setter('unsupported');
      }
    }
  };

  const testNotifications = async () => {
    if (typeof Notification === 'undefined') return setNotifications('unsupported');
    const result = await Notification.requestPermission();
    setNotifications(result === 'default' ? 'prompt' : result);
  };

  const testStorage = async () => {
    if (!navigator.storage?.persist) return setStorage('unsupported');
    const persisted = await navigator.storage.persist();
    setStorage(persisted ? 'granted' : 'denied');
  };

  return (
    <div className="max-w-[500px]">
      <h2 className="text-xl font-bold hidden md:block mb-2">App & Permissions</h2>
      <p className="text-sm text-[var(--text-muted)] mb-5">Manage what NexVibe can access on this device.</p>
      <div className="border border-[var(--border)] rounded-2xl px-4">
        <PermissionRow icon={<FiCamera className="w-4 h-4" />} label="Camera" state={camera} onTest={() => testMedia('video', setCamera)} />
        <PermissionRow icon={<FiMic className="w-4 h-4" />} label="Microphone" state={mic} onTest={() => testMedia('audio', setMic)} />
        <PermissionRow icon={<FiBell className="w-4 h-4" />} label="Notifications" state={notifications} onTest={testNotifications} />
        <PermissionRow icon={<FiHardDrive className="w-4 h-4" />} label="Storage" state={storage} onTest={testStorage} />
      </div>
    </div>
  );
}

function BlockedSection() {
  const [blocked, setBlocked] = useState([]);
  const [loading, setLoading] = useState(true);
  useState(() => { userAPI.getBlocked().then(({ data }) => setBlocked(data.blockedUsers || [])).catch(() => {}).finally(() => setLoading(false)); }, []);
  return (
    <div className="max-w-[500px]">
      <h2 className="text-xl font-bold hidden md:block mb-5">Blocked</h2>
      {loading ? <p className="text-sm text-[var(--text-muted)]">Loading...</p> :
        blocked.length === 0 ? <p className="text-sm text-[var(--text-muted)] text-center py-10">No blocked accounts</p> :
        blocked.map(u => (
          <div key={u._id} className="flex items-center gap-3 py-3 border-b border-[var(--border)]">
            <Avatar src={u.avatar} size={44} alt={u.fullName} />
            <div className="flex-1"><p className="font-semibold text-sm">{u.username}</p></div>
            <button onClick={async () => { await userAPI.blockUser(u._id); setBlocked(prev => prev.filter(b => b._id !== u._id)); toast.success('Unblocked'); }}
              className="btn-outline text-sm px-4 py-1.5">Unblock</button>
          </div>
        ))
      }
    </div>
  );
}

function HelpSection() {
  return (
    <div className="max-w-[500px]">
      <h2 className="text-xl font-bold hidden md:block mb-5">Help</h2>
      {['Help Center', 'Privacy and Security Help', 'Support Inbox', 'Report a problem', 'About'].map(item => (
        <a key={item} href="#" className="flex items-center justify-between py-3 border-b border-[var(--border)] text-sm hover:text-[var(--text-secondary)] transition-colors">
          {item} <span className="text-[var(--text-muted)]">›</span>
        </a>
      ))}
    </div>
  );
}
