import { useState, useEffect, useMemo } from 'react';
import { FiSearch } from 'react-icons/fi';
import { adminAPI } from '../../services/api';
import { COUNTRIES } from '../../lib/countries';
import toast from 'react-hot-toast';

const MODES = [
  { key: 'allow_all', label: 'Allow all' },
  { key: 'whitelist', label: 'Whitelist' },
  { key: 'blacklist', label: 'Blacklist' },
];

export default function AdminCountries() {
  const [mode, setMode] = useState('allow_all');
  const [selected, setSelected] = useState(new Set());
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await adminAPI.getGeoRestriction();
        setMode(data.mode);
        setSelected(new Set(data.countries));
      } catch (err) {
        // The geo-restriction API is adminOnly; a moderator who navigates
        // here directly by URL (bypassing the hidden nav link) gets a 403,
        // not a transient failure -- show a clear permission message
        // instead of the generic "failed to load" toast.
        if (err.response?.status === 403) {
          setForbidden(true);
        } else {
          toast.error('Failed to load geo-restriction settings');
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase() === q);
  }, [search]);

  const toggle = (code) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data } = await adminAPI.updateGeoRestriction({ mode, countries: [...selected] });
      setSelected(new Set(data.countries));
      toast.success('Geo-restriction settings saved');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-6 text-sm text-[var(--text-secondary)]">Loading...</div>;
  }

  if (forbidden) {
    return (
      <div className="p-6 text-sm text-[var(--text-secondary)]">
        You don't have permission to manage this.
      </div>
    );
  }

  return (
    <div className="max-w-[600px] p-4 sm:p-6">
      <h1 className="text-xl font-bold mb-1">Country management</h1>
      <p className="text-sm text-[var(--text-secondary)] mb-5">
        Control which countries can access NexVibe. Default is "Allow all" -- no restriction.
      </p>

      <div className="flex gap-2 mb-5 border border-[var(--border)] rounded-xl p-1">
        {MODES.map((m) => (
          <button key={m.key} onClick={() => setMode(m.key)}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
              mode === m.key ? 'bg-pink-500 text-white' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
            }`}>
            {m.label}
          </button>
        ))}
      </div>

      {mode === 'allow_all' ? (
        <p className="text-sm text-[var(--text-secondary)] mb-5">
          No restriction — everyone can access NexVibe.
        </p>
      ) : (
        <>
          <div className="relative mb-3">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
            <input type="text" placeholder="Search countries..." value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field pl-9" />
          </div>
          <p className="text-xs text-[var(--text-muted)] mb-2">{selected.size} countries selected</p>
          <div className="border border-[var(--border)] rounded-2xl divide-y divide-[var(--border)] max-h-[400px] overflow-y-auto">
            {filtered.map((c) => (
              <label key={c.code} className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-[var(--bg-tertiary)] transition-colors">
                <span className={`fi fi-${c.code.toLowerCase()} flex-shrink-0 rounded-sm`} />
                <span className="text-sm flex-1 min-w-0 truncate">{c.name}</span>
                <span className="text-xs text-[var(--text-muted)]">{c.code}</span>
                <input type="checkbox" checked={selected.has(c.code)} onChange={() => toggle(c.code)}
                  className="w-4 h-4 accent-pink-500 flex-shrink-0" />
              </label>
            ))}
          </div>
        </>
      )}

      <button onClick={handleSave} disabled={saving} className="btn-primary w-full py-2.5 rounded-xl mt-5">
        {saving ? 'Saving...' : 'Save changes'}
      </button>
    </div>
  );
}
