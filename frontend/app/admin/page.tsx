'use client';

import { useEffect, useState } from 'react';

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  'https://profile-site-backend-63802277247.us-central1.run.app';
const ADMIN_TOKEN_KEY = 'admin-token';

type Entry = [string, number];

export default function Admin() {
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    const saved = sessionStorage.getItem(ADMIN_TOKEN_KEY);
    if (saved) setToken(saved);
  }, []);

  useEffect(() => {
    if (token) fetchLeaderboard(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function fetchLeaderboard(t: string) {
    setLoading(true);
    setActionError('');
    try {
      const res = await fetch(`${API_URL}/api/admin/leaderboard`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (res.status === 401) {
        sessionStorage.removeItem(ADMIN_TOKEN_KEY);
        setToken(null);
        setLoginError('Session expired, please log in again');
        return;
      }
      if (!res.ok) {
        setActionError('Could not load leaderboard');
        return;
      }
      const data = await res.json();
      setEntries(data.leaderboard ?? []);
    } catch {
      setActionError('Could not reach the backend');
    } finally {
      setLoading(false);
    }
  }

  async function login() {
    setLoginError('');
    try {
      const res = await fetch(`${API_URL}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        setLoginError('Incorrect password');
        return;
      }
      const data = await res.json();
      sessionStorage.setItem(ADMIN_TOKEN_KEY, data.token);
      setToken(data.token);
      setPassword('');
    } catch {
      setLoginError('Could not reach the backend');
    }
  }

  function logout() {
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    setToken(null);
    setEntries([]);
  }

  async function deleteEntry(name: string) {
    if (!token) return;
    if (!confirm(`Delete "${name}" from the leaderboard?`)) return;
    setActionError('');
    try {
      const res = await fetch(`${API_URL}/api/admin/score/${encodeURIComponent(name)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setActionError('Could not delete that entry');
        return;
      }
      setEntries((prev) => prev.filter(([n]) => n !== name));
    } catch {
      setActionError('Could not reach the backend');
    }
  }

  async function clearAll() {
    if (!token) return;
    if (!confirm('Clear the entire leaderboard? This cannot be undone.')) return;
    setActionError('');
    try {
      const res = await fetch(`${API_URL}/api/admin/leaderboard`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setActionError('Could not clear the leaderboard');
        return;
      }
      setEntries([]);
    } catch {
      setActionError('Could not reach the backend');
    }
  }

  if (!token) {
    return (
      <div>
        <h1 className="font-display text-3xl font-semibold mb-8">Admin</h1>
        <div className="max-w-sm mx-auto mt-12 bg-canvas border border-hairline rounded-lg p-6 text-center">
          <p className="text-ink mb-4">Enter the admin password</p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && login()}
            placeholder="Password"
            className="w-full bg-canvas border border-hairline rounded-lg px-3 py-2 text-sm mb-2 text-center focus:outline-none focus:border-mint"
          />
          {loginError && <p className="text-xs text-red-500 mb-4">{loginError}</p>}
          <button
            onClick={login}
            className="bg-mint text-canvas px-4 py-2 rounded-lg text-sm font-mono"
          >
            Log in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="font-display text-3xl font-semibold">Admin</h1>
        <button onClick={logout} className="text-xs font-mono text-sage hover:text-mint">
          Log out
        </button>
      </div>

      <div className="flex items-center justify-between mb-4">
        <p className="text-sage text-sm">{entries.length} entries</p>
        <button
          onClick={clearAll}
          className="border border-hairline text-sage hover:text-red-500 hover:border-red-400 rounded-full px-3 py-1 text-xs font-mono transition-colors"
        >
          Clear all
        </button>
      </div>

      {actionError && <p className="text-xs text-red-500 mb-4">{actionError}</p>}

      {loading ? (
        <p className="text-sage text-sm">Loading…</p>
      ) : (
        <ol className="space-y-1 font-mono text-sm">
          {entries.map(([name, score], i) => (
            <li key={name} className="flex justify-between items-center border-b border-hairline py-2">
              <span>{i + 1}. {name}</span>
              <span className="flex items-center gap-3">
                <span>{Math.round(score)}</span>
                <button onClick={() => deleteEntry(name)} className="text-xs text-sage hover:text-red-500">
                  Delete
                </button>
              </span>
            </li>
          ))}
          {entries.length === 0 && <li className="text-sage">No entries.</li>}
        </ol>
      )}
    </div>
  );
}
