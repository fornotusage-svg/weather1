import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setToken } from '../api.js';

export default function AdminLogin() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    const res = await api.adminLogin(username.trim(), password);
    setBusy(false);
    if (!res.ok) {
      setError(res.error || 'Login failed');
      return;
    }
    setToken(res.data.token);
    navigate('/admin/dashboard', { replace: true });
  };

  return (
    <div className="card login-card">
      <h1 style={{ marginTop: 0, marginBottom: 4 }}>Admin login</h1>
      <p style={{ color: 'var(--muted)', marginTop: 0, marginBottom: 18 }}>
        Sign in to view submissions.
      </p>
      <form onSubmit={onSubmit} autoComplete="off">
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 6 }}>
            Username
          </label>
          <input
            className="text-input"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={{ width: '100%' }}
            autoFocus
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 6 }}>
            Password
          </label>
          <input
            className="text-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>
        <button className="btn" type="submit" disabled={busy || !username || !password} style={{ width: '100%' }}>
          {busy ? <><span className="loader" />Signing in…</> : 'Sign in'}
        </button>
        {error && <div className="alert bad" style={{ marginTop: 12 }}>{error}</div>}
        <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 14 }}>
          Demo credentials: <code>amol</code> / <code>amol.@</code>
        </p>
      </form>
    </div>
  );
}
