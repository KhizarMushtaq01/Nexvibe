import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import Avatar from '../common/Avatar';
import { FiUsers, FiFileText, FiBarChart2, FiArrowLeft, FiSun, FiMoon, FiLogOut, FiFlag, FiStar } from 'react-icons/fi';
import { MdOutlineAdminPanelSettings } from 'react-icons/md';

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const { toggleTheme, isDark } = useTheme();
  const navigate = useNavigate();

  const navItems = [
    { to: '/admin', label: 'Dashboard', Icon: FiBarChart2, end: true },
    { to: '/admin/users', label: 'Users', Icon: FiUsers },
    { to: '/admin/posts', label: 'Posts', Icon: FiFileText },
    { to: '/admin/reports', label: 'Reports', Icon: FiFlag },
    { to: '/admin/reviews', label: 'Reviews', Icon: FiStar },
  ];

  return (
    <div className="flex min-h-screen bg-[var(--bg-secondary)]">
      <aside className="w-64 flex-shrink-0 bg-[var(--bg-primary)] border-r border-[var(--border)] flex flex-col fixed h-full z-30">
        <div className="p-6 border-b border-[var(--border)]">
          <div className="flex items-center gap-2 mb-1">
            <MdOutlineAdminPanelSettings className="w-6 h-6 text-pink-500" />
            <span className="font-bold text-lg">Admin Panel</span>
          </div>
          <p className="text-xs text-[var(--text-muted)]">NexVibe Management</p>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map(({ to, label, Icon, end }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors
                ${isActive ? 'bg-pink-50 dark:bg-pink-950/20 text-pink-600 dark:text-pink-400' : 'hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'}`}>
              <Icon className="w-4 h-4" /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-[var(--border)] space-y-1">
          <button onClick={() => navigate('/feed')} className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm w-full hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] transition-colors">
            <FiArrowLeft className="w-4 h-4" /> Back to App
          </button>
          <button onClick={toggleTheme} className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm w-full hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] transition-colors">
            {isDark ? <FiSun className="w-4 h-4" /> : <FiMoon className="w-4 h-4" />}
            {isDark ? 'Light mode' : 'Dark mode'}
          </button>
          <button onClick={logout} className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm w-full hover:bg-[var(--bg-tertiary)] text-red-500 transition-colors">
            <FiLogOut className="w-4 h-4" /> Log out
          </button>
          <div className="flex items-center gap-3 px-3 py-2 mt-1">
            <Avatar src={user?.avatar} size={32} alt={user?.fullName} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{user?.username}</p>
              <p className="text-xs text-[var(--text-muted)] capitalize">{user?.role}</p>
            </div>
          </div>
        </div>
      </aside>
      <main className="flex-1 ml-64 min-h-screen"><Outlet /></main>
    </div>
  );
}
