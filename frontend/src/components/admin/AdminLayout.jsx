import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import Avatar from '../common/Avatar';
import { FiUsers, FiFileText, FiBarChart2, FiArrowLeft, FiSun, FiMoon, FiLogOut, FiFlag, FiStar, FiBriefcase, FiMenu, FiX, FiGlobe } from 'react-icons/fi';
import { MdOutlineAdminPanelSettings } from 'react-icons/md';

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const { toggleTheme, isDark } = useTheme();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const navItems = [
    { to: '/admin', label: 'Dashboard', Icon: FiBarChart2, end: true },
    { to: '/admin/users', label: 'Users', Icon: FiUsers },
    { to: '/admin/team', label: 'Team', Icon: FiBriefcase },
    { to: '/admin/posts', label: 'Posts', Icon: FiFileText },
    { to: '/admin/reports', label: 'Reports', Icon: FiFlag },
    { to: '/admin/reviews', label: 'Reviews', Icon: FiStar },
    // The geo-restriction admin API is adminOnly (admin/superadmin), but
    // AdminRoute admits moderators too -- hide this link for roles that
    // can't actually use the page it leads to.
    { to: '/admin/countries', label: 'Countries', Icon: FiGlobe, roles: ['admin', 'superadmin'] },
  ];

  return (
    <div className="flex min-h-screen bg-[var(--bg-secondary)]">
      {/* Mobile top bar -- below lg the sidebar is an off-canvas drawer, so
          navigation needs a visible trigger here. */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-30 h-14 bg-[var(--bg-primary)] border-b border-[var(--border)] flex items-center gap-3 px-4">
        <button onClick={() => setDrawerOpen(true)} className="p-1.5 -ml-1.5 hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors">
          <FiMenu className="w-5 h-5" />
        </button>
        <MdOutlineAdminPanelSettings className="w-5 h-5 text-pink-500 flex-shrink-0" />
        <span className="font-bold">Admin Panel</span>
      </header>

      {/* Backdrop for the mobile drawer */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/50 animate-fade-in" onClick={() => setDrawerOpen(false)} />
      )}

      {/* Sidebar: static on desktop, off-canvas slide-in drawer below lg */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 flex-shrink-0 bg-[var(--bg-primary)] border-r border-[var(--border)] flex flex-col transition-transform duration-300 lg:translate-x-0
        ${drawerOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-6 border-b border-[var(--border)] flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <MdOutlineAdminPanelSettings className="w-6 h-6 text-pink-500" />
              <span className="font-bold text-lg">Admin Panel</span>
            </div>
            <p className="text-xs text-[var(--text-muted)]">NexVibe Management</p>
          </div>
          <button onClick={() => setDrawerOpen(false)} className="lg:hidden p-1.5 -mr-1.5 -mt-1 hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors">
            <FiX className="w-5 h-5" />
          </button>
        </div>
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navItems.filter(({ roles }) => !roles || roles.includes(user?.role)).map(({ to, label, Icon, end }) => (
            <NavLink key={to} to={to} end={end} onClick={() => setDrawerOpen(false)}
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
      <main className="flex-1 lg:ml-64 pt-14 lg:pt-0 min-h-screen min-w-0"><Outlet /></main>
    </div>
  );
}
