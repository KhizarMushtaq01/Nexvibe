import { useState, useEffect } from 'react';
import { adminAPI } from '../../services/api';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { useTheme } from '../../context/ThemeContext';

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const { isDark } = useTheme();

  useEffect(() => {
    adminAPI.getDashboard().then(({ data }) => setStats(data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="p-8">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {Array(8).fill(0).map((_, i) => <div key={i} className="h-28 rounded-2xl shimmer" />)}
      </div>
    </div>
  );

  const cards = [
    { label: 'Total Users', value: stats?.stats.totalUsers?.toLocaleString() || 0, icon: '👥', color: 'from-blue-500 to-blue-600', change: `+${stats?.stats.newUsersToday} today` },
    { label: 'Active Users', value: stats?.stats.activeUsers?.toLocaleString() || 0, icon: '✅', color: 'from-green-500 to-green-600', change: 'Currently active' },
    { label: 'Total Posts', value: stats?.stats.totalPosts?.toLocaleString() || 0, icon: '📸', color: 'from-pink-500 to-pink-600', change: `+${stats?.stats.newPostsToday} today` },
    { label: 'Verified Users', value: stats?.stats.verifiedUsers?.toLocaleString() || 0, icon: '☑️', color: 'from-purple-500 to-purple-600', change: 'Verified accounts' },
    { label: 'Total Stories', value: stats?.stats.totalStories?.toLocaleString() || 0, icon: '🔵', color: 'from-orange-500 to-orange-600', change: 'Active stories' },
    { label: 'Banned Users', value: stats?.stats.bannedUsers?.toLocaleString() || 0, icon: '🚫', color: 'from-red-500 to-red-600', change: 'Need review' },
    { label: 'New Today', value: stats?.stats.newUsersToday?.toLocaleString() || 0, icon: '🆕', color: 'from-teal-500 to-teal-600', change: 'Registered today' },
    { label: 'Posts Today', value: stats?.stats.newPostsToday?.toLocaleString() || 0, icon: '📝', color: 'from-indigo-500 to-indigo-600', change: 'Created today' },
  ];

  const chartColor = isDark ? '#a8a8a8' : '#555';

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-[var(--text-secondary)] text-sm mt-1">Welcome back! Here's what's happening.</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map((card, i) => (
          <div key={i} className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-2xl p-5 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between mb-3">
              <span className="text-2xl">{card.icon}</span>
              <span className={`text-xs font-medium bg-gradient-to-r ${card.color} bg-clip-text text-transparent`}>
                {card.change}
              </span>
            </div>
            <p className="text-2xl font-bold mb-1">{card.value}</p>
            <p className="text-xs text-[var(--text-muted)]">{card.label}</p>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-2xl p-6">
          <h2 className="font-bold mb-4">User Growth (7 days)</h2>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={stats?.userGrowth || []}>
              <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#262626' : '#f0f0f0'} />
              <XAxis dataKey="_id" tick={{ fontSize: 11, fill: chartColor }} tickFormatter={v => v.slice(5)} />
              <YAxis tick={{ fontSize: 11, fill: chartColor }} />
              <Tooltip contentStyle={{ background: isDark ? '#1c1c1c' : '#fff', border: '1px solid #dbdbdb', borderRadius: 8 }} />
              <Line type="monotone" dataKey="count" stroke="#E1306C" strokeWidth={2.5} dot={{ r: 4, fill: '#E1306C' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-2xl p-6">
          <h2 className="font-bold mb-4">Posts Created (7 days)</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={stats?.postGrowth || []}>
              <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#262626' : '#f0f0f0'} />
              <XAxis dataKey="_id" tick={{ fontSize: 11, fill: chartColor }} tickFormatter={v => v.slice(5)} />
              <YAxis tick={{ fontSize: 11, fill: chartColor }} />
              <Tooltip contentStyle={{ background: isDark ? '#1c1c1c' : '#fff', border: '1px solid #dbdbdb', borderRadius: 8 }} />
              <Bar dataKey="count" fill="#833ab4" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
