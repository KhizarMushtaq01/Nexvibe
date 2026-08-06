import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { searchAPI } from '../../services/api';
import Avatar from '../../components/common/Avatar';
import PostGrid from '../../components/post/PostGrid';
import { FiSearch, FiX, FiClock } from 'react-icons/fi';
import { MdVerified } from 'react-icons/md';

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('all');
  const [recentSearches, setRecentSearches] = useState(() => {
    try { return JSON.parse(localStorage.getItem('nexvibe_searches') || '[]'); } catch { return []; }
  });
  const inputRef = useRef(null);
  const navigate = useNavigate();
  const searchTimer = useRef(null);
  const suggestTimer = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Suggestions while typing
  useEffect(() => {
    clearTimeout(suggestTimer.current);
    if (!query.trim()) { setSuggestions([]); return; }
    suggestTimer.current = setTimeout(async () => {
      try {
        const { data } = await searchAPI.getSuggestions(query);
        setSuggestions(data.suggestions || []);
      } catch {}
    }, 250);
  }, [query]);

  const doSearch = useCallback(async (q = query, t = tab) => {
    if (!q.trim()) return;
    setLoading(true);
    setSuggestions([]);
    try {
      const { data } = await searchAPI.search(q.trim(), t);
      setResults(data.results);
      // Save to recent
      const updated = [q.trim(), ...recentSearches.filter(r => r !== q.trim())].slice(0, 10);
      setRecentSearches(updated);
      localStorage.setItem('nexvibe_searches', JSON.stringify(updated));
    } catch {} finally { setLoading(false); }
  }, [query, tab, recentSearches]);

  const handleKeyDown = (e) => { if (e.key === 'Enter') doSearch(); };

  const clearSearch = () => { setQuery(''); setSuggestions([]); setResults(null); inputRef.current?.focus(); };

  const removeRecent = (item, e) => {
    e.stopPropagation();
    const updated = recentSearches.filter(r => r !== item);
    setRecentSearches(updated);
    localStorage.setItem('nexvibe_searches', JSON.stringify(updated));
  };

  const TABS = ['all', 'accounts', 'posts', 'tags'];

  return (
    <div className="max-w-[600px] mx-auto pt-4 pb-20 px-4">
      {/* Search Input */}
      <div className="relative mb-4">
        <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search users, hashtags, posts…"
          className="input-field pl-10 pr-10 py-3"
        />
        {query && (
          <button onClick={clearSearch}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 hover:bg-[var(--bg-tertiary)] rounded-full transition-colors">
            <FiX className="w-4 h-4 text-[var(--text-muted)]" />
          </button>
        )}
      </div>

      {/* Suggestions dropdown */}
      {suggestions.length > 0 && !results && (
        <div className="card overflow-hidden mb-4">
          {suggestions.map(u => (
            <Link key={u._id} to={`/${u.username}`}
              className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--bg-tertiary)] transition-colors">
              <Avatar src={u.avatar} size={44} alt={u.fullName} />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm flex items-center gap-1 truncate">
                  {u.username}
                  {u.isVerified && <MdVerified className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />}
                </p>
                <p className="text-xs text-[var(--text-muted)] truncate">{u.fullName}</p>
              </div>
            </Link>
          ))}
          <button onClick={() => doSearch()}
            className="w-full px-4 py-3 text-sm text-blue-500 font-semibold hover:bg-[var(--bg-tertiary)] transition-colors border-t border-[var(--border)]">
            See all results for "{query}"
          </button>
        </div>
      )}

      {/* Recent searches (no query) */}
      {!query && !results && (
        <div>
          {recentSearches.length > 0 && (
            <>
              <div className="flex items-center justify-between mb-3">
                <p className="font-bold text-sm">Recent</p>
                <button onClick={() => { setRecentSearches([]); localStorage.removeItem('nexvibe_searches'); }}
                  className="text-sm text-blue-500 hover:text-blue-600 font-semibold">Clear all</button>
              </div>
              {recentSearches.map((r, i) => (
                <div key={i}
                  onClick={() => { setQuery(r); doSearch(r); }}
                  className="flex items-center gap-3 px-2 py-2.5 rounded-xl cursor-pointer hover:bg-[var(--bg-tertiary)] transition-colors group">
                  <div className="w-11 h-11 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center flex-shrink-0">
                    <FiClock className="w-5 h-5 text-[var(--text-muted)]" />
                  </div>
                  <span className="flex-1 text-sm">{r}</span>
                  <button onClick={e => removeRecent(r, e)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1">
                    <FiX className="w-4 h-4 text-[var(--text-muted)]" />
                  </button>
                </div>
              ))}
            </>
          )}
          {recentSearches.length === 0 && (
            <div className="text-center py-12">
              <FiSearch className="w-12 h-12 text-[var(--text-muted)] mx-auto mb-3" />
              <p className="font-bold mb-1">Search NexVibe</p>
              <p className="text-sm text-[var(--text-secondary)]">Find people, posts, and hashtags.</p>
            </div>
          )}
        </div>
      )}

      {/* Search results */}
      {results && (
        <div>
          {/* Tab filters */}
          <div className="flex gap-2 mb-5 overflow-x-auto hide-scrollbar pb-1">
            {TABS.map(t => (
              <button key={t} onClick={() => { setTab(t); doSearch(query, t); }}
                className={`px-4 py-1.5 rounded-full text-sm font-medium flex-shrink-0 transition-colors capitalize
                  ${tab === t
                    ? 'bg-[var(--text-primary)] text-[var(--bg-primary)]'
                    : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--border)]'}`}>
                {t}
              </button>
            ))}
          </div>

          {loading && (
            <div className="flex justify-center py-10">
              <div className="w-6 h-6 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!loading && (
            <>
              {/* Users */}
              {(results.users?.length > 0) && (
                <div className="mb-6">
                  <p className="font-bold text-sm text-[var(--text-secondary)] mb-3">Accounts</p>
                  {results.users.map(u => (
                    <Link key={u._id} to={`/${u.username}`}
                      className="flex items-center gap-3 px-2 py-3 rounded-xl hover:bg-[var(--bg-tertiary)] transition-colors">
                      <Avatar src={u.avatar} size={44} alt={u.fullName} />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm flex items-center gap-1 truncate">
                          {u.username}
                          {u.isVerified && <MdVerified className="w-3.5 h-3.5 text-blue-500" />}
                        </p>
                        <p className="text-xs text-[var(--text-muted)] truncate">
                          {u.fullName} · {(u.followers?.length || 0).toLocaleString()} followers
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}

              {/* Hashtags */}
              {results.hashtags?.length > 0 && (
                <div className="mb-6">
                  <p className="font-bold text-sm text-[var(--text-secondary)] mb-3">Hashtags</p>
                  {results.hashtags.map(tag => (
                    <Link key={tag._id} to={`/hashtag/${tag._id}`}
                      className="flex items-center gap-3 px-2 py-3 rounded-xl hover:bg-[var(--bg-tertiary)] transition-colors">
                      <div className="w-11 h-11 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center text-lg font-bold text-[var(--text-secondary)]">
                        #
                      </div>
                      <div>
                        <p className="font-semibold text-sm">#{tag._id}</p>
                        <p className="text-xs text-[var(--text-muted)]">{tag.count.toLocaleString()} posts</p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}

              {/* Posts grid */}
              {results.posts?.length > 0 && (
                <div>
                  <p className="font-bold text-sm text-[var(--text-secondary)] mb-3">Posts</p>
                  <PostGrid posts={results.posts} />
                </div>
              )}

              {/* No results */}
              {!results.users?.length && !results.hashtags?.length && !results.posts?.length && (
                <div className="text-center py-16">
                  <FiSearch className="w-10 h-10 mx-auto mb-3 text-[var(--text-muted)]" />
                  <p className="font-bold mb-1">No results for "{query}"</p>
                  <p className="text-sm text-[var(--text-secondary)]">Try searching for a different term.</p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
