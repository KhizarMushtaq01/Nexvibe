import { useState, useEffect } from 'react';
import { FiArrowLeft } from 'react-icons/fi';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { adminAPI } from '../../services/api';
import Avatar from '../../components/common/Avatar';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

export default function AdminUserDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminAPI.getUser(id).then(({ data }) => setUser(data.user)).catch(() => navigate('/admin/users')).finally(() => setLoading(false));
  }, [id]);

  const handleBan = async () => {
    const reason = prompt('Ban reason:');
    if (reason === null) return;
    try {
      await adminAPI.banUser(id, { reason });
      setUser(u => ({ ...u, isBanned: true, banReason: reason }));
      toast.success('User banned');
    } catch { toast.error('Failed'); }
  };

  const handleUnban = async () => {
    try { await adminAPI.unbanUser(id); setUser(u => ({ ...u, isBanned: false })); toast.success('User unbanned'); }
    catch { toast.error('Failed'); }
  };

  const handleVerify = async () => {
    try { await adminAPI.verifyUser(id); setUser(u => ({ ...u, isVerified: !u.isVerified })); toast.success('Done'); }
    catch { toast.error('Failed'); }
  };

  const handleRole = async (role) => {
    try { await adminAPI.changeRole(id, role); setUser(u => ({ ...u, role })); toast.success('Role updated'); }
    catch { toast.error('Failed'); }
  };

  const handleDelete = async () => {
    if (!confirm('Permanently delete this user?')) return;
    try { await adminAPI.deleteUser(id); toast.success('Deleted'); navigate('/admin/users'); }
    catch { toast.error('Failed'); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" /></div>;
  if (!user) return null;

  return (
    <div className="p-6 max-w-4xl">
      <button onClick={() => navigate('/admin/users')} className="flex items-center gap-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] mb-6 transition-colors">
        <FiArrowLeft className="w-4 h-4" /> Back to users
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profile card */}
        <div className="lg:col-span-1">
          <div className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-2xl p-6 text-center">
            <Avatar src={user.avatar} size={80} alt={user.fullName} className="mx-auto mb-4" />
            <div className="flex items-center justify-center gap-2 mb-1">
              <h2 className="text-lg font-bold">{user.fullName}</h2>
              {user.isVerified && <MdVerified className="w-5 h-5 text-blue-500" />}
            </div>
            <p className="text-[var(--text-secondary)] text-sm mb-1">@{user.username}</p>
            <p className="text-[var(--text-muted)] text-xs mb-4">{user.email}</p>

            <div className="flex justify-center gap-1 mb-4">
              <span className={`text-xs px-2 py-1 rounded-full font-medium
                ${user.role === 'admin' ? 'bg-red-50 dark:bg-red-950/20 text-red-600' : user.role === 'moderator' ? 'bg-orange-50 text-orange-600' : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]'}`}>
                {user.role}
              </span>
              <span className={`text-xs px-2 py-1 rounded-full font-medium
                ${user.isBanned ? 'bg-red-50 text-red-600' : 'bg-green-50 dark:bg-green-950/20 text-green-600'}`}>
                {user.isBanned ? 'Banned' : 'Active'}
              </span>
            </div>

            {user.bio && <p className="text-sm text-[var(--text-secondary)] mb-4 italic">"{user.bio}"</p>}

            <div className="grid grid-cols-3 gap-2 text-center mb-4 py-3 border-y border-[var(--border)]">
              <div><p className="font-bold text-sm">{user.postsCount || 0}</p><p className="text-xs text-[var(--text-muted)]">Posts</p></div>
              <div><p className="font-bold text-sm">{user.followers?.length || 0}</p><p className="text-xs text-[var(--text-muted)]">Followers</p></div>
              <div><p className="font-bold text-sm">{user.following?.length || 0}</p><p className="text-xs text-[var(--text-muted)]">Following</p></div>
            </div>

            <Link to={`/${user.username}`} target="_blank"
              className="text-sm text-blue-500 hover:text-blue-600 font-medium">
              View profile ↗
            </Link>
          </div>
        </div>

        {/* Details & Actions */}
        <div className="lg:col-span-2 space-y-5">
          {/* Account info */}
          <div className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-2xl p-5">
            <h3 className="font-bold mb-4">Account Information</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                { label: 'User ID', value: user._id },
                { label: 'Email', value: user.email },
                { label: 'Phone', value: user.phone || 'Not set' },
                { label: 'Auth Provider', value: user.authProvider },
                { label: 'Email Verified', value: user.isEmailVerified ? '✅ Yes' : '❌ No' },
                { label: '2FA Enabled', value: user.twoFactorEnabled ? '✅ Yes' : '❌ No' },
                { label: 'Account Type', value: user.accountType },
                { label: 'Joined', value: format(new Date(user.createdAt), 'PPP') },
                { label: 'Last Seen', value: user.lastSeen ? format(new Date(user.lastSeen), 'PPP p') : 'N/A' },
                { label: 'Online', value: user.isOnline ? '🟢 Online' : '⚫ Offline' },
              ].map(({ label, value }) => (
                <div key={label} className="bg-[var(--bg-tertiary)] rounded-lg p-3">
                  <p className="text-xs text-[var(--text-muted)] mb-0.5">{label}</p>
                  <p className="font-medium text-xs break-all">{value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-2xl p-5">
            <h3 className="font-bold mb-4">Admin Actions</h3>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={handleVerify}
                className={`py-2.5 px-4 rounded-xl text-sm font-semibold transition-colors border ${user.isVerified ? 'border-gray-300 text-gray-600 hover:bg-gray-50' : 'border-blue-300 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/20'}`}>
                {user.isVerified ? '✓ Remove verification' : '☑ Verify account'}
              </button>
              <button onClick={user.isBanned ? handleUnban : handleBan}
                className={`py-2.5 px-4 rounded-xl text-sm font-semibold transition-colors border ${user.isBanned ? 'border-green-300 text-green-600 hover:bg-green-50' : 'border-orange-300 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950/20'}`}>
                {user.isBanned ? '🔓 Unban user' : '🚫 Ban user'}
              </button>
              {user.banReason && (
                <div className="col-span-2 bg-red-50 dark:bg-red-950/20 rounded-xl p-3">
                  <p className="text-xs text-red-600 font-medium">Ban reason: {user.banReason}</p>
                </div>
              )}
              <div className="col-span-2">
                <p className="text-xs text-[var(--text-muted)] mb-2 font-medium">Change role</p>
                <div className="flex gap-2">
                  {['user', 'moderator', 'admin'].map(role => (
                    <button key={role} onClick={() => handleRole(role)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors capitalize
                        ${user.role === role ? 'bg-[var(--text-primary)] text-[var(--bg-primary)]' : 'bg-[var(--bg-tertiary)] hover:bg-[var(--border)]'}`}>
                      {role}
                    </button>
                  ))}
                </div>
              </div>
              {user.role !== 'admin' && (
                <button onClick={handleDelete}
                  className="col-span-2 py-2.5 px-4 rounded-xl text-sm font-semibold border border-red-300 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors">
                  🗑 Delete account permanently
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
