import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, downloadExport, setToken } from '../api.js';

const COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'latitude', label: 'Latitude' },
  { key: 'longitude', label: 'Longitude' },
  { key: 'weather', label: 'Weather' },
  { key: 'ip', label: 'IP' },
  { key: 'meta', label: 'Metadata' },
  { key: 'createdAt', label: 'Date & time' },
  { key: 'actions', label: '' },
];

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [sort, setSort] = useState('newest');
  const [data, setData] = useState({ items: [], total: 0, pages: 1, page: 1 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    const res = await api.listSubmissions({ page, limit, search, sort });
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      // 401 → kick back to login
      if (res.status === 401) {
        setToken(null);
        navigate('/admin/login', { replace: true });
      }
      return;
    }
    setData(res.data);
  }, [page, limit, search, sort, navigate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Debounce search input → server query
  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1);
      setSearch(searchInput.trim());
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const onDelete = async (id) => {
    if (!window.confirm('Delete this submission? This cannot be undone.')) return;
    const res = await api.deleteSubmission(id);
    if (!res.ok) {
      alert(res.error);
      return;
    }
    fetchData();
  };

  const onExport = async () => {
    const res = await downloadExport();
    if (!res.ok) alert(res.error);
  };

  const onLogout = () => {
    setToken(null);
    navigate('/admin/login', { replace: true });
  };

  const startIndex = useMemo(() => (data.total === 0 ? 0 : (page - 1) * limit + 1), [data, page, limit]);
  const endIndex = useMemo(() => Math.min(page * limit, data.total), [data, page, limit]);

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0 }}>Submissions</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--muted)' }}>
            All weather-locator submissions from your users.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn secondary" onClick={onExport} disabled={data.total === 0}>
            Export CSV
          </button>
          <button className="btn ghost" onClick={onLogout}>Sign out</button>
        </div>
      </div>

      <div className="toolbar">
        <input
          className="text-input"
          placeholder="Search by name, summary, or IP…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        <select
          className="text-input"
          value={sort}
          onChange={(e) => { setSort(e.target.value); setPage(1); }}
          style={{ width: 'auto' }}
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
        <button className="btn ghost" onClick={fetchData} disabled={loading}>Refresh</button>
        <span className="badge" style={{ marginLeft: 'auto' }}>
          {data.total} total
        </span>
      </div>

      {error && <div className="alert bad">{error}</div>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {COLUMNS.map(c => <th key={c.key}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {loading && data.items.length === 0 ? (
              <tr><td colSpan={COLUMNS.length} style={{ textAlign: 'center', padding: 30, color: 'var(--muted)' }}>
                <span className="loader" />Loading…
              </td></tr>
            ) : data.items.length === 0 ? (
              <tr><td colSpan={COLUMNS.length} style={{ textAlign: 'center', padding: 30, color: 'var(--muted)' }}>
                No submissions yet.
              </td></tr>
            ) : data.items.map(item => (
              <tr key={item.id}>
                <td><strong>{item.name}</strong></td>
                <td>{Number(item.latitude).toFixed(4)}</td>
                <td>{Number(item.longitude).toFixed(4)}</td>
                <td>
                  {item.weather?.temperature != null
                    ? `${Math.round(item.weather.temperature)}°C, `
                    : ''}
                  {item.weather?.summary || '—'}
                  {item.weather?.windSpeed != null
                    ? ` · ${item.weather.windSpeed} km/h`
                    : ''}
                </td>
                <td><code style={{ fontSize: 12 }}>{item.ip || '—'}</code></td>
                <td>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {item.userAgent && <div title={item.userAgent}>
                      <strong>UA:</strong> {shorten(item.userAgent, 36)}
                    </div>}
                    {item.referer && <div title={item.referer}>
                      <strong>Ref:</strong> {shorten(item.referer, 36)}
                    </div>}
                    {item.consent && <span className="badge" style={{ marginTop: 4, display: 'inline-block' }}>consent</span>}
                  </div>
                </td>
                <td>{formatDate(item.createdAt)}</td>
                <td>
                  <button className="btn danger" onClick={() => onDelete(item.id)} style={{ padding: '6px 10px', fontSize: 13 }}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pagination">
        <div>
          {data.total > 0
            ? `Showing ${startIndex}–${endIndex} of ${data.total}`
            : 'No records'}
        </div>
        <div className="controls">
          <button className="btn ghost" disabled={page <= 1 || loading} onClick={() => setPage(p => Math.max(1, p - 1))}>
            ← Prev
          </button>
          <span style={{ alignSelf: 'center' }}>Page {data.page} / {data.pages}</span>
          <button className="btn ghost" disabled={page >= data.pages || loading} onClick={() => setPage(p => p + 1)}>
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function shorten(s, n) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n) + '…' : s;
}
