import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { notificationAPI, messageAPI } from '../../services/api';
import { useSocket } from '../../context/SocketContext';
import Avatar from '../common/Avatar';
import NotificationsDropdown from '../common/NotificationsDropdown';
import CreatePostModal from '../post/CreatePostModal';

import { FiHome, FiSearch, FiCompass, FiPlay, FiMessageCircle, FiHeart, FiPlusSquare, FiBookmark, FiSettings, FiMenu, FiSun, FiMoon, FiLogOut } from 'react-icons/fi';
import { BsGrid3X3Gap, BsPersonBoundingBox } from 'react-icons/bs';
import { MdOutlineAdminPanelSettings } from 'react-icons/md';

export default function MainLayout() {
  const { user, logout } = useAuth();
  const { toggleTheme, isDark } = useTheme();
  const { on } = useSocket();
  const navigate = useNavigate();
  const location = useLocation();
  const [showCreate, setShowCreate] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [showNotifs, setShowNotifs] = useState(false);

  const isMessages = location.pathname.startsWith('/messages');
  const isReels = location.pathname.startsWith('/reels');
  const collapsed = isMessages || isReels;

  useEffect(() => {
    const fetch = async () => {
      try {
        const [n, m] = await Promise.all([notificationAPI.getUnreadCount(), messageAPI.getUnreadCount()]);
        setUnreadNotifs(n.data.count || 0);
        setUnreadMessages(m.data.unreadCount || 0);
      } catch {}
    };
    fetch();
  }, []);

  useEffect(() => {
    const u1 = on('notification:receive', () => setUnreadNotifs(p => p + 1));
    const u2 = on('message:receive', () => setUnreadMessages(p => p + 1));
    return () => { u1?.(); u2?.(); };
  }, [on]);

  const navItems = [
    { to: '/feed', icon: FiHome, label: 'Home' },
    { to: '/search', icon: FiSearch, label: 'Search' },
    { to: '/explore', icon: FiCompass, label: 'Explore' },
    { to: '/reels', icon: FiPlay, label: 'Reels' },
    { to: '/messages', icon: FiMessageCircle, label: 'Messages', badge: unreadMessages },
    { label: 'Notifications', icon: FiHeart, badge: unreadNotifs, onClick: () => { setShowNotifs(v => !v); setUnreadNotifs(0); } },
    { label: 'Create', icon: FiPlusSquare, onClick: () => setShowCreate(true) },
  ];

  return (
    <div className="flex min-h-screen bg-[var(--bg-primary)]">
      {/* Sidebar */}
      <aside className={`hidden lg:flex flex-col fixed left-0 top-0 h-full z-40 bg-[var(--bg-primary)] border-r border-[var(--border)] transition-all duration-300 ${collapsed ? 'w-[72px]' : 'w-[245px]'}`}>
        {/* Logo */}
        <div className="p-5 mb-2 h-16 flex items-center">
          {!collapsed ? (
            <span className="text-xl font-black text-gradient cursor-pointer select-none" onClick={() => navigate('/feed')}>NexVibe</span>
          ) : (
            <span className="text-2xl cursor-pointer select-none" onClick={() => navigate('/feed')}>✦</span>
          )}
        </div>

        <nav className="flex-1 flex flex-col gap-0.5 px-2 overflow-y-auto">
          {navItems.map((item, i) => {
            const Icon = item.icon;
            if (item.to) {
              return (
                <NavLink key={i} to={item.to}
                  className={({ isActive }) => `sidebar-link ${isActive ? 'font-bold' : 'font-normal'}`}>
                  {({ isActive }) => (
                    <>
                      <div className="relative flex-shrink-0">
                        <Icon className={`w-6 h-6 transition-transform ${isActive ? 'scale-110' : ''}`} strokeWidth={isActive ? 2.5 : 1.8} />
                        {item.badge > 0 && (
                          <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] w-4 h-4 rounded-full flex items-center justify-center font-bold">
                            {item.badge > 9 ? '9+' : item.badge}
                          </span>
                        )}
                      </div>
                      {!collapsed && <span className="text-sm">{item.label}</span>}
                    </>
                  )}
                </NavLink>
              );
            }
            return (
              <button key={i} onClick={item.onClick} className="sidebar-link w-full text-left relative">
                <div className="relative flex-shrink-0">
                  <Icon className="w-6 h-6" strokeWidth={1.8} />
                  {item.badge > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] w-4 h-4 rounded-full flex items-center justify-center font-bold">
                      {item.badge > 9 ? '9+' : item.badge}
                    </span>
                  )}
                </div>
                {!collapsed && <span className="text-sm">{item.label}</span>}
                {item.label === 'Notifications' && showNotifs && (
                  <NotificationsDropdown onClose={() => setShowNotifs(false)} />
                )}
              </button>
            );
          })}

          {/* Profile link */}
          <NavLink to={`/${user?.username}`}
            className={({ isActive }) => `sidebar-link ${isActive ? 'font-bold' : 'font-normal'}`}>
            <Avatar src={user?.avatar} size={24} alt={user?.fullName} className="flex-shrink-0" />
            {!collapsed && <span className="text-sm">Profile</span>}
          </NavLink>
        </nav>

        {/* More menu */}
        <div className="px-2 pb-4 relative">
          <button onClick={() => setShowMore(v => !v)} className="sidebar-link w-full">
            <FiMenu className="w-6 h-6 flex-shrink-0" strokeWidth={1.8} />
            {!collapsed && <span className="text-sm">More</span>}
          </button>
          {showMore && (
            <div className="absolute bottom-14 left-2 w-56 bg-[var(--bg-primary)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden animate-scale-in z-50">
              <button onClick={toggleTheme} className="flex items-center gap-3 px-4 py-3 w-full hover:bg-[var(--bg-tertiary)] text-sm transition-colors">
                {isDark ? <FiSun className="w-4 h-4" /> : <FiMoon className="w-4 h-4" />}
                {isDark ? 'Light mode' : 'Dark mode'}
              </button>
              <NavLink to="/saved" onClick={() => setShowMore(false)} className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--bg-tertiary)] text-sm transition-colors">
                <FiBookmark className="w-4 h-4" /> Saved
              </NavLink>
              <NavLink to="/settings" onClick={() => setShowMore(false)} className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--bg-tertiary)] text-sm transition-colors">
                <FiSettings className="w-4 h-4" /> Settings
              </NavLink>
              {['admin','moderator','superadmin'].includes(user?.role) && (
                <NavLink to="/admin" onClick={() => setShowMore(false)} className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--bg-tertiary)] text-sm transition-colors">
                  <MdOutlineAdminPanelSettings className="w-4 h-4" /> Admin Panel
                </NavLink>
              )}
              <div className="border-t border-[var(--border)]" />
              <button onClick={logout} className="flex items-center gap-3 px-4 py-3 w-full hover:bg-[var(--bg-tertiary)] text-sm text-red-500 transition-colors">
                <FiLogOut className="w-4 h-4" /> Log out
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className={`flex-1 transition-all duration-300 ${collapsed ? 'lg:ml-[72px]' : 'lg:ml-[245px]'} pb-16 lg:pb-0 min-w-0`}>
        <Outlet />
      </main>

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[var(--bg-primary)] border-t border-[var(--border)] flex items-center justify-around px-2 py-2 safe-area-pb">
        {[
          { to: '/feed', Icon: FiHome },
          { to: '/explore', Icon: FiCompass },
          { onClick: () => setShowCreate(true), Icon: FiPlusSquare },
          { to: '/reels', Icon: FiPlay },
          { to: `/${user?.username}`, isAvatar: true },
        ].map((item, i) => {
          if (item.isAvatar) return (
            <NavLink key={i} to={item.to} className="p-2">
              <Avatar src={user?.avatar} size={28} alt={user?.fullName} />
            </NavLink>
          );
          if (item.onClick) return (
            <button key={i} onClick={item.onClick} className="p-2">
              <item.Icon className="w-7 h-7" strokeWidth={1.8} />
            </button>
          );
          return (
            <NavLink key={i} to={item.to} className={({ isActive }) => `p-2 ${isActive ? 'scale-110' : ''} transition-transform`}>
              {({ isActive }) => <item.Icon className="w-7 h-7" strokeWidth={isActive ? 2.5 : 1.8} />}
            </NavLink>
          );
        })}
      </nav>

      {showCreate && <CreatePostModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
