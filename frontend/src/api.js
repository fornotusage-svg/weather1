// Small fetch helper.
// We never let "Failed to fetch" leak to the UI — we normalize every error
// into a user-friendly message and return a structured result.

const TOKEN_KEY = 'wl_admin_token';

// In production the static frontend (e.g. surge.sh) is hosted on a different
// origin than the API. Vite injects VITE_API_BASE at build time so we can
// point the client at any backend URL.
const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');

function withBase(path) {
  if (path.startsWith('http')) return path;
  return `${API_BASE}${path}`;
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || null;
}

export function setToken(t) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  const token = getToken();
  if (token && options.auth) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(withBase(path), { ...options, headers });
  } catch (networkErr) {
    return { ok: false, error: 'Cannot reach the server right now. Please try again in a moment.' };
  }

  let data = null;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    try { data = await res.json(); } catch { data = null; }
  } else {
    try { data = { text: await res.text() }; } catch { data = null; }
  }

  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: (data && data.error) || 'Something went wrong. Please try again.',
    };
  }
  return { ok: true, data, status: res.status };
}

export const api = {
  health: () => request('/api/health'),
  weather: (lat, lon) => request(`/api/weather?lat=${lat}&lon=${lon}`),
  submit: (payload) =>
    request('/api/submissions', { method: 'POST', body: JSON.stringify(payload) }),
  adminLogin: (username, password) =>
    request('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  listSubmissions: (params = {}) => {
    const qs = new URLSearchParams();
    if (params.page) qs.set('page', params.page);
    if (params.limit) qs.set('limit', params.limit);
    if (params.search) qs.set('search', params.search);
    if (params.sort) qs.set('sort', params.sort);
    return request(`/api/admin/submissions?${qs.toString()}`, { auth: true });
  },
  deleteSubmission: (id) =>
    request(`/api/admin/submissions/${id}`, { method: 'DELETE', auth: true }),
  exportCsvUrl: () => {
    const t = getToken();
    // Token is sent via header in a real API, but for the convenience of
    // opening the CSV in a new tab we accept it via Authorization header
    // by using a small fetch+download pattern. Here we return the path
    // and the dashboard does an authenticated blob download.
    return '/api/admin/export.csv';
  },
};

export async function downloadExport() {
  const t = getToken();
  if (!t) return { ok: false, error: 'Not signed in' };
  let res;
  try {
    res = await fetch(withBase('/api/admin/export.csv'), { headers: { Authorization: `Bearer ${t}` } });
  } catch {
    return { ok: false, error: 'Network error while exporting.' };
  }
  if (!res.ok) return { ok: false, error: 'Could not export right now.' };
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `weather-locator-submissions-${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return { ok: true };
}
