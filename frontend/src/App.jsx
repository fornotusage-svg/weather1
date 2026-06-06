import React from 'react';
import { Routes, Route, Link, Navigate } from 'react-router-dom';
import Home from './pages/Home.jsx';
import AdminLogin from './pages/AdminLogin.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import { getToken } from './api.js';

function ProtectedRoute({ children }) {
  const token = getToken();
  if (!token) return <Navigate to="/admin/login" replace />;
  return children;
}

export default function App() {
  return (
    <div className="app">
      <div className="topbar">
        <Link to="/" className="brand" style={{ color: 'inherit' }}>
          <div className="brand-logo" aria-hidden>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M7 18a5 5 0 1 1 1.6-9.74A6 6 0 0 1 20 12a4 4 0 0 1 0 8H7z" fill="#fff" />
              <circle cx="9" cy="9" r="2.4" fill="#ffe27a" />
            </svg>
          </div>
          <div className="brand-name">Weather Locator</div>
        </Link>
        <Link to="/admin" className="nav-link">Admin</Link>
      </div>

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/admin" element={<Navigate to="/admin/login" replace />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route
          path="/admin/dashboard"
          element={
            <ProtectedRoute>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
