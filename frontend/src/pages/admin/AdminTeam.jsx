import { useState, useEffect, useCallback } from 'react';
import { FiPlus, FiSearch, FiSlash, FiTrash2, FiX, FiEye, FiEyeOff, FiBriefcase } from 'react-icons/fi';
import { MdVerified } from 'react-icons/md';
import { adminAPI } from '../../services/api';
import { Link } from 'react-router-dom';
import Avatar from '../../components/common/Avatar';
import { formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';
import { useConfirm } from '../../context/DialogContext';
import { useAuth } from '../../context/AuthContext';

const ROLE_META = {
  team_member: { label: 'Team Member', tag: 'bg-blue-50 dark:bg-blue-950/20 text-blue-600' },
  moderator: { label: 'Moderator', tag: 'bg-orange-50 dark:bg-orange-950/20 text-orange-600' },
  admin: { label: 'Admin', tag: 'bg-red-50 dark:bg-red-950/20 text-red-600' },
  superadmin: { label: 'Superadmin', tag: 'bg-purple-50 dark:bg-purple-950/20 text-purple-600' },
};

const EMPTY_FORM = { fullName: '', email: '', password: '', department: '', role: 'team_member' };

export default function AdminTeam() {
  const confirmDialog = useConfirm();
  const { user: currentUser } = useAuth();
  const isSuperadmin = currentUser?.role === 'superadmin';

  const [members, setMembers] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const roleOptions = ['team_member', 'moderator', 'admin', ...(isSuperadmin ? ['superadmin'] : [])];

  const loadMembers = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await adminAPI.getTeamMembers({ page, limit: 20, search, role: filter });
      setMembers(data.users);
      setTotal(data.total);
      setPages(data.pages);
    } catch { toast.error('Failed to load team members'); }
    finally { setLoading(false); }
  }, [page, search, filter]);

  useEffect(() => { loadMembers(); }, [loadMembers]);

  useEffect(() => {
    const t = setTimeout(() => { setPage(1); loadMembers(); }, 500);
    return () => clearTimeout(t);
  }, [search]);

  const handleRoleChange = async (id, role) => {
    const prev = members.find(m => m._id === id)?.role;
    setMembers(p => p.map(m => m._id === id ? { ...m, role } : m));
    try {
      await adminAPI.changeRole(id, role);
      toast.success('Role updated');
    } catch (err) {
      setMembers(p => p.map(m => m._id === id ? { ...m, role: prev } : m));
      toast.error(err.response?.data?.message || 'Failed to update role');
    }
  };

  const handleBan = async (id, isBanned) => {
    try {
      if (isBanned) { await adminAPI.unbanUser(id); toast.success('Member unblocked'); }
      else { await adminAPI.banUser(id, { reason: 'Blocked by admin' }); toast.success('Member blocked'); }
      setMembers(p => p.map(m => m._id === id ? { ...m, isBanned: !isBanned } : m));
    } catch { toast.error('Failed'); }
  };

  const handleDelete = async (id) => {
    if (!(await confirmDialog({ message: 'Remove this team member permanently? This cannot be undone.', danger: true, confirmLabel: 'Delete' }))) return;
    try {
      await adminAPI.deleteUser(id);
      setMembers(p => p.filter(m => m._id !== id));
      setTotal(t => t - 1);
      toast.success('Team member removed');
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  };

  const openModal = () => { setForm(EMPTY_FORM); setErrors({}); setShowPassword(false); setModalOpen(true); };

  const validate = () => {
    const e = {};
    if (!form.fullName.trim()) e.fullName = 'Full name is required';
    if (!/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(form.email)) e.email = 'Enter a valid email';
    if (form.password.length < 8) e.password = 'Min 8 characters';
    if (!roleOptions.includes(form.role)) e.role = 'Select a valid role';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleCreate = async (ev) => {
    ev.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      const { data } = await adminAPI.createTeamMember(form);
      setMembers(p => [data.user, ...p]);
      setTotal(t => t + 1);
      toast.success('Team member added');
      setModalOpen(false);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add team member');
    } finally { setSubmitting(false); }
  };

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><FiBriefcase className="w-6 h-6 text-pink-500" /> Team Members</h1>
          <p className="text-[var(--text-secondary)] text-sm">{total.toLocaleString()} team {total === 1 ? 'member' : 'members'}</p>
        </div>
        <button onClick={openModal}
          className="btn-primary px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5">
          <FiPlus className="w-4 h-4" /> Add Member
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
        <div className="flex items-center gap-2 flex-wrap">
          {['', 'team_member', 'moderator', 'admin', 'superadmin'].map(f => (
            <button key={f} onClick={() => { setFilter(f); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize
                ${filter === f ? 'bg-[var(--text-primary)] text-[var(--bg-primary)]' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--border)]'}`}>
              {f ? ROLE_META[f].label : 'All'}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array(6).fill(0).map((_, i) => (
            <div key={i} className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-2xl p-5 h-52 shimmer" />
          ))}
        </div>
      ) : members.length === 0 ? (
        <div className="text-center py-20 bg-[var(--bg-primary)] border border-[var(--border)] rounded-2xl">
          <FiBriefcase className="w-10 h-10 mx-auto mb-3 text-[var(--text-muted)]" />
          <p className="font-bold text-lg mb-1">No team members yet</p>
          <p className="text-sm text-[var(--text-secondary)] mb-4">Add moderators, team members and admins to help run NexVibe.</p>
          <button onClick={openModal} className="btn-primary px-5 py-2 rounded-xl text-sm inline-flex items-center gap-1.5">
            <FiPlus className="w-4 h-4" /> Add Member
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {members.map(m => (
            <div key={m._id} className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-2xl p-5 flex flex-col gap-3 hover:shadow-md transition-shadow">
              <div className="flex items-start gap-3">
                <Avatar src={m.avatar} size={48} alt={m.fullName} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <Link to={`/${m.username}`} target="_blank" className="font-semibold text-sm truncate hover:underline">{m.fullName}</Link>
                    {m.isVerified && <MdVerified className="w-4 h-4 text-blue-500 flex-shrink-0" />}
                  </div>
                  <p className="text-xs text-[var(--text-muted)] truncate">@{m.username}</p>
                  <p className="text-xs text-[var(--text-muted)] truncate">{m.email}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <select value={m.role} onChange={e => handleRoleChange(m._id, e.target.value)}
                  disabled={m.role === 'superadmin' && !isSuperadmin}
                  className={`text-xs font-medium pl-2 pr-6 py-1 rounded-full capitalize border-0 cursor-pointer disabled:cursor-not-allowed disabled:opacity-70 focus:outline-none focus:ring-2 focus:ring-pink-400 ${ROLE_META[m.role]?.tag || 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]'}`}>
                  {['team_member', 'moderator', 'admin', ...(isSuperadmin || m.role === 'superadmin' ? ['superadmin'] : [])].map(r => (
                    <option key={r} value={r} className="bg-[var(--bg-primary)] text-[var(--text-primary)]">{ROLE_META[r].label}</option>
                  ))}
                </select>
                {m.department && (
                  <span className="text-xs font-medium px-2 py-1 rounded-full bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">
                    {m.department}
                  </span>
                )}
                <span className={`text-xs font-medium px-2 py-1 rounded-full ${m.isBanned ? 'bg-red-50 dark:bg-red-950/20 text-red-600' : 'bg-green-50 dark:bg-green-950/20 text-green-600'}`}>
                  {m.isBanned ? 'Blocked' : 'Active'}
                </span>
              </div>

              <p className="text-xs text-[var(--text-muted)]">Joined {formatDistanceToNow(new Date(m.createdAt), { addSuffix: true })}</p>

              <div className="flex items-center gap-2 mt-auto pt-2 border-t border-[var(--border)]">
                <Link to={`/admin/users/${m._id}`}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold hover:bg-[var(--bg-tertiary)] transition-colors" title="View">
                  <FiEye className="w-3.5 h-3.5" /> View
                </Link>
                <button onClick={() => handleBan(m._id, m.isBanned)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold hover:bg-orange-50 dark:hover:bg-orange-950/20 transition-colors" title={m.isBanned ? 'Unblock' : 'Block'}>
                  <FiSlash className={`w-3.5 h-3.5 ${m.isBanned ? 'text-orange-500' : 'text-[var(--text-muted)]'}`} /> {m.isBanned ? 'Unblock' : 'Block'}
                </button>
                {m.role !== 'admin' && m.role !== 'superadmin' && (
                  <button onClick={() => handleDelete(m._id)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors" title="Delete">
                    <FiTrash2 className="w-3.5 h-3.5" /> Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between mt-6 flex-wrap gap-3">
          <p className="text-sm text-[var(--text-muted)]">
            Showing {((page - 1) * 20) + 1}–{Math.min(page * 20, total)} of {total}
          </p>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="btn-outline px-3 py-1.5 text-sm disabled:opacity-50">← Prev</button>
            <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages}
              className="btn-outline px-3 py-1.5 text-sm disabled:opacity-50">Next →</button>
          </div>
        </div>
      )}

      {/* Add Member modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={e => e.target === e.currentTarget && setModalOpen(false)}>
          <form onSubmit={handleCreate}
            className="bg-[var(--bg-primary)] rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] sticky top-0 bg-[var(--bg-primary)] rounded-t-2xl">
              <h2 className="font-bold text-lg flex items-center gap-2"><FiPlus className="w-5 h-5 text-pink-500" /> Add Team Member</h2>
              <button type="button" onClick={() => setModalOpen(false)} className="p-1.5 hover:bg-[var(--bg-tertiary)] rounded-full transition-colors">
                <FiX className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-semibold text-[var(--text-secondary)] mb-1.5 block">Full Name</label>
                <input value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))}
                  placeholder="e.g. Ayesha Khan" className="input-field w-full" />
                {errors.fullName && <p className="text-xs text-red-500 mt-1">{errors.fullName}</p>}
              </div>

              <div>
                <label className="text-xs font-semibold text-[var(--text-secondary)] mb-1.5 block">Email</label>
                <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="name@company.com" className="input-field w-full" />
                {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
              </div>

              <div>
                <label className="text-xs font-semibold text-[var(--text-secondary)] mb-1.5 block">Password</label>
                <div className="relative">
                  <input type={showPassword ? 'text' : 'password'} value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    placeholder="Min 8 characters" className="input-field w-full pr-10" />
                  <button type="button" onClick={() => setShowPassword(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                    {showPassword ? <FiEyeOff className="w-4 h-4" /> : <FiEye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password}</p>}
              </div>

              <div>
                <label className="text-xs font-semibold text-[var(--text-secondary)] mb-1.5 block">Department</label>
                <input value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
                  placeholder="e.g. Trust & Safety" list="department-suggestions" className="input-field w-full" />
                <datalist id="department-suggestions">
                  <option value="Engineering" /><option value="Design" /><option value="Marketing" />
                  <option value="Support" /><option value="Trust & Safety" /><option value="Operations" />
                </datalist>
              </div>

              <div>
                <label className="text-xs font-semibold text-[var(--text-secondary)] mb-1.5 block">Role</label>
                <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                  className="input-field w-full capitalize">
                  {roleOptions.map(r => <option key={r} value={r}>{ROLE_META[r].label}</option>)}
                </select>
                {errors.role && <p className="text-xs text-red-500 mt-1">{errors.role}</p>}
              </div>
            </div>

            <div className="flex gap-3 px-6 py-4 border-t border-[var(--border)]">
              <button type="button" onClick={() => setModalOpen(false)} className="btn-outline flex-1">Cancel</button>
              <button type="submit" disabled={submitting} className="btn-primary flex-1 disabled:opacity-60">
                {submitting ? 'Adding…' : 'Add Member'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
