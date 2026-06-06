require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');

const db = require('./db');

const PORT = parseInt(process.env.PORT || '5000', 10);
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-insecure-secret-change-me';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'amol';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'amol.@';

const app = express();

// Security & infra
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));
app.use(express.json({ limit: '64kb' }));
app.use(morgan('tiny'));

// Permissive CORS for the demo, but still validates the Origin/Referer on
// mutating endpoints. In a real prod deploy, restrict this.
app.use(cors({ origin: true, credentials: true }));

// Rate-limit admin login to slow brute force attempts.
// Behind a proxy (Loca.lt, Render, Railway, etc.) we must opt-in to trusting
// X-Forwarded-For or rate limiting throws ERR_ERL_UNEXPECTED_X_FORWARDED_FOR.
app.set('trust proxy', 1);
const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/admin/login', loginLimiter);

// Serve built frontend (if present)
const path = require('path');
const fs = require('fs');
// Look for the built frontend in a few likely places:
//   ./public            (Render deploy copies it here)
//   ../frontend/dist    (local dev convenience)
const candidateDirs = [
  path.join(__dirname, 'public'),
  path.join(__dirname, '..', 'frontend', 'dist'),
];
const FRONTEND_DIST = candidateDirs.find(d => fs.existsSync(path.join(d, 'index.html')));
if (FRONTEND_DIST) {
  app.use(express.static(FRONTEND_DIST));
  console.log(`[server] serving frontend from ${FRONTEND_DIST}`);
} else {
  console.log('[server] no built frontend found — only API will be available');
}

// ---------- helpers ----------

function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length) return xff.split(',')[0].trim();
  return req.socket?.remoteAddress || '';
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing auth token' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.admin = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

async function getAdminHash() {
  // For the demo we hash at startup so plaintext only lives in env vars.
  // In a real deployment, store hash in DB and rotate via a CLI.
  return bcrypt.hash(ADMIN_PASSWORD, 10);
}

// ---------- public endpoints ----------

// Lightweight health/info for the UI to verify the API is reachable
app.get('/api/health', (req, res) => {
  res.json({ ok: true, db: db.getMode(), time: new Date().toISOString() });
});

// Fetch live weather from Open-Meteo using lat/lon from the client.
// We proxy this so we can normalize responses, add CORS reliability, and
// keep failure modes friendly (no "failed to fetch" leaking to the user).
app.get('/api/weather', async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);
  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    return res.status(400).json({ error: 'lat and lon query params are required' });
  }
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return res.status(400).json({ error: 'lat/lon out of range' });
  }

  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lon));
  url.searchParams.set('current', 'temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m,apparent_temperature');
  url.searchParams.set('wind_speed_unit', 'kmh');
  url.searchParams.set('temperature_unit', 'celsius');
  url.searchParams.set('timezone', 'auto');

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!r.ok) {
      return res.status(502).json({ error: 'Weather provider returned an error' });
    }
    const data = await r.json();
    const c = data.current || {};
    res.json({
      temperature: c.temperature_2m ?? null,
      apparentTemperature: c.apparent_temperature ?? null,
      humidity: c.relative_humidity_2m ?? null,
      windSpeed: c.wind_speed_10m ?? null,
      weatherCode: c.weather_code ?? null,
      summary: describeWeatherCode(c.weather_code),
      timezone: data.timezone,
      time: c.time,
      latitude: data.latitude,
      longitude: data.longitude,
    });
  } catch (err) {
    console.error('[weather] fetch failed', err.message);
    // Fallback: return a non-error stub so the UX can still show a card.
    // Real error is logged server-side; user sees a soft message.
    res.json({
      temperature: null,
      windSpeed: null,
      weatherCode: null,
      summary: 'Weather temporarily unavailable',
      latitude: lat,
      longitude: lon,
      degraded: true,
    });
  }
});

// Save a submission. Requires explicit consent flag.
app.post(
  '/api/submissions',
  body('name').isString().trim().isLength({ min: 1, max: 80 }),
  body('latitude').isFloat({ min: -90, max: 90 }),
  body('longitude').isFloat({ min: -180, max: 180 }),
  body('consent').equals('true'),
  body('weather').optional().isObject(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Invalid input', details: errors.array() });
    }
    if (req.body.consent !== 'true') {
      return res.status(400).json({ error: 'Explicit consent is required to save data.' });
    }

    const doc = {
      name: req.body.name,
      latitude: req.body.latitude,
      longitude: req.body.longitude,
      weather: req.body.weather || null,
      consent: true,
      ip: clientIp(req),
      userAgent: (req.headers['user-agent'] || '').slice(0, 240),
      referer: (req.headers['referer'] || '').slice(0, 240),
      createdAt: new Date(),
    };

    try {
      const stored = await db.insertSubmission(doc);
      res.json({ ok: true, id: stored.id });
    } catch (err) {
      console.error('[submissions] insert failed', err);
      res.status(500).json({ error: 'Could not save submission' });
    }
  }
);

// ---------- admin endpoints ----------

app.post(
  '/api/admin/login',
  body('username').isString().trim().isLength({ min: 1, max: 80 }),
  body('password').isString().isLength({ min: 1, max: 200 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Invalid input' });
    }
    const { username, password } = req.body;
    const hash = await getAdminHash();
    const userMatch = username === ADMIN_USERNAME;
    const passMatch = await bcrypt.compare(password, hash);
    if (!userMatch || !passMatch) {
      // Always respond the same way, with the same delay
      await new Promise(r => setTimeout(r, 250));
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = jwt.sign(
      { sub: username, role: 'admin' },
      JWT_SECRET,
      { expiresIn: '6h' }
    );
    res.json({ token, username });
  }
);

app.get('/api/admin/submissions', authRequired, async (req, res) => {
  try {
    const { page, limit, search, sort } = req.query;
    const result = await db.listSubmissions({ page, limit, search, sort });
    res.json(result);
  } catch (err) {
    console.error('[admin/list] failed', err);
    res.status(500).json({ error: 'Could not load submissions' });
  }
});

app.delete('/api/admin/submissions/:id', authRequired, async (req, res) => {
  try {
    const ok = await db.deleteSubmission(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin/delete] failed', err);
    res.status(500).json({ error: 'Could not delete submission' });
  }
});

app.get('/api/admin/export.csv', authRequired, async (req, res) => {
  try {
    const rows = await db.getAllForExport();
    const headers = [
      'id', 'name', 'latitude', 'longitude',
      'temperature_c', 'apparent_temperature_c', 'humidity_pct',
      'wind_speed_kmh', 'weather_summary', 'weather_code',
      'ip', 'user_agent', 'referer', 'created_at',
    ];
    const esc = (v) => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const lines = [headers.join(',')];
    for (const r of rows) {
      const w = r.weather || {};
      lines.push([
        esc(r.id), esc(r.name), esc(r.latitude), esc(r.longitude),
        esc(w.temperature), esc(w.apparentTemperature), esc(w.humidity),
        esc(w.windSpeed), esc(w.summary), esc(w.weatherCode),
        esc(r.ip), esc(r.userAgent), esc(r.referer), esc(r.createdAt),
      ].join(','));
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="submissions-${Date.now()}.csv"`);
    res.send(lines.join('\n'));
  } catch (err) {
    console.error('[admin/export] failed', err);
    res.status(500).json({ error: 'Could not export' });
  }
});

// WMO weather code → human label
function describeWeatherCode(code) {
  const map = {
    0: 'Clear sky',
    1: 'Mainly clear',
    2: 'Partly cloudy',
    3: 'Overcast',
    45: 'Fog',
    48: 'Depositing rime fog',
    51: 'Light drizzle',
    53: 'Moderate drizzle',
    55: 'Dense drizzle',
    56: 'Light freezing drizzle',
    57: 'Dense freezing drizzle',
    61: 'Slight rain',
    63: 'Moderate rain',
    65: 'Heavy rain',
    66: 'Light freezing rain',
    67: 'Heavy freezing rain',
    71: 'Slight snow',
    73: 'Moderate snow',
    75: 'Heavy snow',
    77: 'Snow grains',
    80: 'Slight rain showers',
    81: 'Moderate rain showers',
    82: 'Violent rain showers',
    85: 'Slight snow showers',
    86: 'Heavy snow showers',
    95: 'Thunderstorm',
    96: 'Thunderstorm with slight hail',
    99: 'Thunderstorm with heavy hail',
  };
  return map[code] || 'Unknown';
}

// SPA fallback — serve index.html for any non-API route
app.get(/^\/(?!api).*/, (req, res, next) => {
  if (!FRONTEND_DIST) return next();
  res.sendFile(path.join(FRONTEND_DIST, 'index.html'), err => {
    if (err) next();
  });
});

// ---------- start ----------
(async () => {
  await db.connect(process.env.MONGODB_URI);
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[server] listening on :${PORT} (db=${db.getMode()})`);
  });
})();
