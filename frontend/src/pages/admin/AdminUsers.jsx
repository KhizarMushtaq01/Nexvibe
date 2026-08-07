import { useState, useEffect, useCallback } from 'react';
import { FiCheck, FiEye, FiFilter, FiSearch, FiSlash, FiTrash2, FiSend } from 'react-icons/fi';
import { MdVerified } from 'react-icons/md';
import { adminAPI } from '../../services/api';
import { Link } from 'react-router-dom';
import Avatar from '../../components/common/Avatar';
import { formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';
import { useConfirm } from '../../context/DialogContext';
import { useAuth } from '../../context/AuthContext';

const ROLE_OPTIONS = ['user', 'moderator', 'team_member', 'admin', 'superadmin'];

export default function AdminUsers() {
  const confirmDialog = useConfirm();
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const [notifModal, setNotifModal] = useState(false);
  const [notifText, setNotifText] = useState('');
  const [selectedUsers, setSelectedUsers] = useState(new Set());

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await adminAPI.getUsers({ page, limit: 20, search, status: filter });
      setUsers(data.users);
      setTotal(data.total);
      setPages(data.pages);
    } catch { toast.error('Failed to load users'); }
    finally { setLoading(false); }
  }, [page, search, filter]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  useEffect(() => {
    const t = setTimeout(() => { setPage(1); loadUsers(); }, 500);
    return () => clearTimeout(t);
  }, [search]);

  const handleBan = async (id, isBanned) => {
    try {
      if (isBanned) { await adminAPI.unbanUser(id); toast.success('User unbanned'); }
      else { await adminAPI.banUser(id, { reason: 'Policy violation' }); toast.success('User banned'); }
      setUsers(prev => prev.map(u => u._id === id ? { ...u, isBanned: !isBanned } : u));
    } catch { toast.error('Failed'); }
  };

  const handleVerify = async (id, isVerified) => {
    try {
      await adminAPI.verifyUser(id);
      setUsers(prev => prev.map(u => u._id === id ? { ...u, isVerified: !isVerified } : u));
      toast.success(isVerified ? 'Verification removed' : 'User verified');
    } catch { toast.error('Failed'); }
  };

  const handleRoleChange = async (id, role) => {
    const prev = users.find(u => u._id === id)?.role;
    setUsers(p => p.map(u => u._id === id ? { ...u, role } : u));
    try {
      await adminAPI.changeRole(id, role);
      toast.success(`Role updated to ${role.replace('_', ' ')}`);
    } catch (err) {
      setUsers(p => p.map(u => u._id === id ? { ...u, role: prev } : u));
      toast.error(err.response?.data?.message || 'Failed to update role');
    }
  };

  const handleDelete = async (id) => {
    if (!(await confirmDialog({ message: 'Delete this user permanently? This cannot be undone.', danger: true, confirmLabel: 'Delete' }))) return;
    try {
      await adminAPI.deleteUser(id);
      setUsers(prev => prev.filter(u => u._id !== id));
      toast.success('User deleted');
    } catch { toast.error('Failed'); }
  };

  const handleSendNotif = async () => {
    if (!notifText.trim()) return;
    try {
      const userIds = selectedUsers.size > 0 ? Array.from(selectedUsers) : 'all';
      await adminAPI.sendNotification({ userIds, text: notifText, type: 'system' });
      toast.success(`Notification sent to ${selectedUsers.size > 0 ? selectedUsers.size : 'all'} users`);
      setNotifModal(false);
      setNotifText('');
      setSelectedUsers(new Set());
    } catch { toast.error('Failed'); }
  };

  const toggleSelect = (id) => {
    setSelectedUsers(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const roleTag = { superadmin: 'bg-purple-50 dark:bg-purple-950/20 text-purple-600', admin: 'bg-red-50 dark:bg-red-950/20 text-red-600', team_member: 'bg-blue-50 dark:bg-blue-950/20 text-blue-600', moderator: 'bg-orange-50 dark:bg-orange-950/20 text-orange-600', user: 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]' };

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Users</h1>
          <p className="text-[var(--text-secondary)] text-sm">{total.toLocaleString()} total users</p>
        </div>
        <button onClick={() => setNotifModal(true)}
          className="btn-primary px-4 py-2.5 rounded-xl text-sm flex items-center justify-center gap-1.5">
          <FiSend className="w-4 h-4" /> Send Notification
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="relative flex-1 min-w-[200px]">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, username, email..."
            className="input-field pl-9 w-full" />
        </div>
        <div className="flex items-center gap-2">
          <FiFilter className="w-4 h-4 text-[var(--text-muted)]" />
          {['', 'active', 'banned', 'verified'].map(f => (
            <button key={f} onClick={() => { setFilter(f); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
                ${filter === f ? 'bg-[var(--text-primary)] text-[var(--bg-primary)]' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--border)]'}`}>
              {f || 'All'}
            </button>
          ))}
        </div>
      </div>

      {/* Table (md and up) */}
      <div className="hidden md:block bg-[var(--bg-primary)] border border-[var(--border)] rounded-2xl overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[auto,1fr,auto,auto,auto,auto] gap-4 px-4 py-3 bg-[var(--bg-tertiary)] text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
          <div className="w-5" />
          <div>User</div>
          <div>Role</div>
          <div>Status</div>
          <div>Joined</div>
          <div>Actions</div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-16 text-[var(--text-muted)]">No users found</div>
        ) : (
          users.map(u => (
            <div key={u._id}
              className="grid grid-cols-[auto,1fr,auto,auto,auto,auto] gap-4 items-center px-4 py-3.5 border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-tertiary)] transition-colors">
              {/* Checkbox */}
              <input type="checkbox" checked={selectedUsers.has(u._id)} onChange={() => toggleSelect(u._id)}
                className="w-4 h-4 accent-blue-500 cursor-pointer" />

              {/* User info */}
              <div className="flex items-center gap-3 min-w-0">
                <div className="relative flex-shrink-0">
                  <Avatar src={u.avatar} size={40} alt={u.fullName} />
                  {u.isOnline && <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-[var(--bg-primary)]" />}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="font-semibold text-sm truncate">{u.username}</p>
                    {u.isVerified && <MdVerified className="w-4 h-4 text-blue-500 flex-shrink-0" />}
                  </div>
                  <p className="text-xs text-[var(--text-muted)] truncate">{u.email}</p>
                </div>
              </div>

              {/* Role */}
              <select value={u.role} onChange={e => handleRoleChange(u._id, e.target.value)}
                disabled={u.role === 'superadmin' && currentUser?.role !== 'superadmin'}
                className={`text-xs font-medium pl-2 pr-6 py-1 rounded-full capitalize border-0 cursor-pointer disabled:cursor-not-allowed disabled:opacity-70 focus:outline-none focus:ring-2 focus:ring-pink-400 ${roleTag[u.role] || roleTag.user}`}>
                {ROLE_OPTIONS.filter(r => r !== 'superadmin' || currentUser?.role === 'superadmin' || u.role === 'superadmin').map(r => (
                  <option key={r} value={r} className="bg-[var(--bg-primary)] text-[var(--text-primary)]">
                    {r.replace('_', ' ')}
                  </option>
                ))}
              </select>

              {/* Status */}
              <span className={`text-xs font-medium px-2 py-1 rounded-full
                ${u.isBanned ? 'bg-red-50 dark:bg-red-950/20 text-red-600' : u.isDeactivated ? 'bg-yellow-50 dark:bg-yellow-950/20 text-yellow-600' : 'bg-green-50 dark:bg-green-950/20 text-green-600'}`}>
                {u.isBanned ? 'Banned' : u.isDeactivated ? 'Deactivated' : 'Active'}
              </span>

              {/* Joined */}
              <p className="text-xs text-[var(--text-muted)] whitespace-nowrap">
                {formatDistanceToNow(new Date(u.createdAt), { addSuffix: true })}
              </p>

              {/* Actions */}
              <div className="flex items-center gap-1">
                <Link to={`/admin/users/${u._id}`}
                  className="p-1.5 hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors" title="View">
                  <FiEye className="w-4 h-4 text-[var(--text-secondary)]" />
                </Link>
                <button onClick={() => handleVerify(u._id, u.isVerified)}
                  className="p-1.5 hover:bg-blue-50 dark:hover:bg-blue-950/20 rounded-lg transition-colors" title={u.isVerified ? 'Remove verify' : 'Verify'}>
                  <FiCheck className={`w-4 h-4 ${u.isVerified ? 'text-blue-500' : 'text-[var(--text-muted)]'}`} />
                </button>
                <button onClick={() => handleBan(u._id, u.isBanned)}
                  className="p-1.5 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg transition-colors" title={u.isBanned ? 'Unban' : 'Ban'}>
                  <FiSlash className={`w-4 h-4 ${u.isBanned ? 'text-red-500' : 'text-[var(--text-muted)]'}`} />
                </button>
                {u.role !== 'admin' && u.role !== 'superadmin' && (
                  <button onClick={() => handleDelete(u._id)}
                    className="p-1.5 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg transition-colors" title="Delete">
                    <FiTrash2 className="w-4 h-4 text-red-400 hover:text-red-500" />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Cards (below md) */}
      <div className="md:hidden bg-[var(--bg-primary)] border border-[var(--border)] rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-16 text-[var(--text-muted)]">No users found</div>
        ) : (
          users.map(u => (
            <div key={u._id} className="p-4 border-b border-[var(--border)] last:border-0 flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <input type="checkbox" checked={selectedUsers.has(u._id)} onChange={() => toggleSelect(u._id)}
                  className="w-4 h-4 accent-blue-500 cursor-pointer flex-shrink-0" />
                <div className="relative flex-shrink-0">
                  <Avatar src={u.avatar} size={40} alt={u.fullName} />
                  {u.isOnline && <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-[var(--bg-primary)]" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="font-semibold text-sm truncate">{u.username}</p>
                    {u.isVerified && <MdVerified className="w-4 h-4 text-blue-500 flex-shrink-0" />}
                  </div>
                  <p className="text-xs text-[var(--text-muted)] truncate">{u.email}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select value={u.role} onChange={e => handleRoleChange(u._id, e.target.value)}
                  disabled={u.role === 'superadmin' && currentUser?.role !== 'superadmin'}
                  className={`text-xs font-medium pl-2 pr-6 py-1 rounded-full capitalize border-0 cursor-pointer disabled:cursor-not-allowed disabled:opacity-70 focus:outline-none focus:ring-2 focus:ring-pink-400 ${roleTag[u.role] || roleTag.user}`}>
                  {ROLE_OPTIONS.filter(r => r !== 'superadmin' || currentUser?.role === 'superadmin' || u.role === 'superadmin').map(r => (
                    <option key={r} value={r} className="bg-[var(--bg-primary)] text-[var(--text-primary)]">
                      {r.replace('_', ' ')}
                    </option>
                  ))}
                </select>
                <span className={`text-xs font-medium px-2 py-1 rounded-full
                  ${u.isBanned ? 'bg-red-50 dark:bg-red-950/20 text-red-600' : u.isDeactivated ? 'bg-yellow-50 dark:bg-yellow-950/20 text-yellow-600' : 'bg-green-50 dark:bg-green-950/20 text-green-600'}`}>
                  {u.isBanned ? 'Banned' : u.isDeactivated ? 'Deactivated' : 'Active'}
                </span>
                <span className="text-xs text-[var(--text-muted)] ml-auto whitespace-nowrap">
                  {formatDistanceToNow(new Date(u.createdAt), { addSuffix: true })}
                </span>
              </div>

              <div className="flex items-center gap-1 pt-1 border-t border-[var(--border)] -mx-4 px-4">
                <Link to={`/admin/users/${u._id}`}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors text-xs font-medium">
                  <FiEye className="w-4 h-4" /> View
                </Link>
                <button onClick={() => handleVerify(u._id, u.isVerified)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 hover:bg-blue-50 dark:hover:bg-blue-950/20 rounded-lg transition-colors text-xs font-medium">
                  <FiCheck className={`w-4 h-4 ${u.isVerified ? 'text-blue-500' : ''}`} /> {u.isVerified ? 'Verified' : 'Verify'}
                </button>
                <button onClick={() => handleBan(u._id, u.isBanned)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg transition-colors text-xs font-medium">
                  <FiSlash className={`w-4 h-4 ${u.isBanned ? 'text-red-500' : ''}`} /> {u.isBanned ? 'Unban' : 'Ban'}
                </button>
                {u.role !== 'admin' && u.role !== 'superadmin' && (
                  <button onClick={() => handleDelete(u._id)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg transition-colors text-xs font-medium text-red-500">
                    <FiTrash2 className="w-4 h-4" /> Delete
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-4">
          <p className="text-sm text-[var(--text-muted)]">
            Showing {((page - 1) * 20) + 1}–{Math.min(page * 20, total)} of {total}
          </p>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="btn-outline px-3 py-1.5 text-sm disabled:opacity-50">← Prev</button>
            {Array.from({ length: Math.min(5, pages) }, (_, i) => {
              const p = Math.max(1, Math.min(pages - 4, page - 2)) + i;
              return (
                <button key={p} onClick={() => setPage(p)}
                  className={`px-3 py-1.5 rounded-lg text-sm ${p === page ? 'bg-[var(--text-primary)] text-[var(--bg-primary)]' : 'btn-outline'}`}>
                  {p}
                </button>
              );
            })}
            <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages}
              className="btn-outline px-3 py-1.5 text-sm disabled:opacity-50">Next →</button>
          </div>
        </div>
      )}

      {/* Send notification modal */}
      {notifModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-[var(--bg-primary)] rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl">
            <h2 className="font-bold text-lg mb-1">Send Notification</h2>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              {selectedUsers.size > 0 ? `Sending to ${selectedUsers.size} selected users` : 'Sending to all users'}
            </p>
            <textarea value={notifText} onChange={e => setNotifText(e.target.value)}
              placeholder="Notification message..." rows={4}
              className="input-field w-full resize-none mb-4" />
            <div className="flex gap-3">
              <button onClick={() => setNotifModal(false)} className="btn-outline flex-1">Cancel</button>
              <button onClick={handleSendNotif} disabled={!notifText.trim()} className="btn-primary flex-1 disabled:opacity-50">
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
