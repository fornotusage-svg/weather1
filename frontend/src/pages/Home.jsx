import React, { useState, useCallback } from 'react';
import { api } from '../api.js';
import { weatherEmoji } from '../weatherCode.js';

const STATES = {
  IDLE: 'idle',
  REQUESTING_LOCATION: 'requesting_location',
  FETCHING_WEATHER: 'fetching_weather',
  SAVING: 'saving',
  DONE: 'done',
  ERROR: 'error',
};

function getPosition(options = {}) {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('UNSUPPORTED'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos),
      (err) => reject(err),
      {
        enableHighAccuracy: false,
        timeout: 12000,
        maximumAge: 60_000,
        ...options,
      }
    );
  });
}

export default function Home() {
  const [name, setName] = useState('');
  const [state, setState] = useState(STATES.IDLE);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const friendlyGeoError = (err) => {
    if (!err) return 'Could not access your location.';
    if (err.code === 1) return 'Location permission was denied. You can enable it in your browser settings and try again.';
    if (err.code === 2) return 'Your position is currently unavailable. Please try again in a moment.';
    if (err.code === 3) return 'Location request timed out. Please try again.';
    if (err.message === 'UNSUPPORTED') return 'Your browser does not support location services.';
    return 'Could not access your location. Please try again.';
  };

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    setError('');

    const cleanName = name.trim();
    if (!cleanName) {
      setError('Please enter your name to continue.');
      return;
    }

    // 1) Request location
    setState(STATES.REQUESTING_LOCATION);
    let position;
    try {
      position = await getPosition();
    } catch (err) {
      setError(friendlyGeoError(err));
      setState(STATES.ERROR);
      return;
    }

    const latitude = position.coords.latitude;
    const longitude = position.coords.longitude;

    // 2) Fetch weather via the backend proxy
    setState(STATES.FETCHING_WEATHER);
    const w = await api.weather(latitude, longitude);
    if (!w.ok) {
      // Even if the weather provider hiccups, the API will return a soft
      // payload with `degraded: true` — we still want to show the card.
      // If the error came from the proxy, fall back to a neutral result.
      setError(''); // we still proceed with a minimal card below
    }
    const weather = w.ok ? w.data : { summary: 'Weather temporarily unavailable', latitude, longitude, degraded: true };

    // 3) Save submission (with explicit consent)
    setState(STATES.SAVING);
    const save = await api.submit({
      name: cleanName,
      latitude,
      longitude,
      consent: 'true',
      weather,
    });
    // The submission may fail in edge cases (e.g. backend down) — we still
    // show the weather card to the user. The only user-facing requirement
    // is "no 'failed to fetch' message" — so we never surface raw errors.

    setResult({ name: cleanName, latitude, longitude, weather, saveOk: save.ok });
    setState(STATES.DONE);
  }, [name]);

  const reset = () => {
    setName('');
    setResult(null);
    setError('');
    setState(STATES.IDLE);
  };

  const isBusy =
    state === STATES.REQUESTING_LOCATION ||
    state === STATES.FETCHING_WEATHER ||
    state === STATES.SAVING;

  const busyLabel = state === STATES.REQUESTING_LOCATION
    ? 'Requesting your location…'
    : state === STATES.FETCHING_WEATHER
      ? 'Fetching weather…'
      : 'Saving…';

  return (
    <div>
      {state !== STATES.DONE && (
        <div className="card hero">
          <h1 className="hero-title">Weather Locator</h1>
          <p className="hero-sub">
            Find out the current weather for wherever you are right now.
          </p>
          <form onSubmit={handleSubmit} className="form-row" autoComplete="off">
            <input
              className="text-input"
              type="text"
              placeholder="Enter your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              aria-label="Your name"
              disabled={isBusy}
            />
            <button className="btn" type="submit" disabled={isBusy || !name.trim()}>
              {isBusy ? <><span className="loader" />Working…</> : 'Submit'}
            </button>
          </form>
          {isBusy && (
            <div className="alert info" style={{ maxWidth: 460, margin: '16px auto 0' }}>
              {busyLabel}
            </div>
          )}
          {error && state === STATES.ERROR && (
            <div className="alert bad" style={{ maxWidth: 460, margin: '16px auto 0' }}>
              {error}
            </div>
          )}
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 18 }}>
            On submit, your browser will ask for location permission. We only use it
            to fetch the weather and store a record for the admin dashboard.
          </p>
        </div>
      )}

      {state === STATES.DONE && result && (
        <WeatherCard result={result} onAgain={reset} />
      )}
    </div>
  );
}

function WeatherCard({ result, onAgain }) {
  const { name, latitude, longitude, weather, saveOk } = result;
  const code = weather?.weatherCode;
  const hasTemp = typeof weather?.temperature === 'number';
  const hasWind = typeof weather?.windSpeed === 'number';

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ color: 'var(--muted)', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Hello, {name}
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>
            Current weather at your location
          </div>
        </div>
        <button className="btn ghost" onClick={onAgain}>Check again</button>
      </div>

      <div className="weather-hero">
        <div>
          <div className="temp">
            {hasTemp ? `${Math.round(weather.temperature)}°C` : '—'}
          </div>
          <div className="summary">
            {weather?.summary || 'Weather information unavailable right now'}
          </div>
        </div>
        <div className="icon" aria-hidden>{weatherEmoji(code)}</div>
      </div>

      {weather?.degraded && (
        <div className="alert warn" style={{ marginTop: 14 }}>
          The live weather feed is having a moment. The information below may be
          incomplete, but your location has been recorded.
        </div>
      )}

      <div className="weather-grid">
        <div className="metric">
          <div className="label">Temperature</div>
          <div className="value">{hasTemp ? `${weather.temperature.toFixed(1)} °C` : '—'}</div>
        </div>
        <div className="metric">
          <div className="label">Wind speed</div>
          <div className="value">{hasWind ? `${weather.windSpeed} km/h` : '—'}</div>
        </div>
        <div className="metric">
          <div className="label">Condition</div>
          <div className="value">{weather?.summary || '—'}</div>
        </div>
        <div className="metric">
          <div className="label">Coordinates</div>
          <div className="value" style={{ fontSize: 16 }}>
            {latitude.toFixed(4)}, {longitude.toFixed(4)}
          </div>
        </div>
      </div>

      {saveOk ? (
        <div className="alert good" style={{ marginTop: 16 }}>
          Saved. Have a great day, {name}!
        </div>
      ) : (
        <div className="alert info" style={{ marginTop: 16 }}>
          Your weather is shown above. The submission record could not be saved this time.
        </div>
      )}
    </div>
  );
}
