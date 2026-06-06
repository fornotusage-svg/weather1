# Weather Locator

A full-stack weather app:

- **Frontend:** React 18 + Vite + React Router (responsive, dark UI).
- **Backend:** Node.js + Express, JWT auth, Open-Meteo proxy, MongoDB (with
  automatic in-memory fallback if no `MONGODB_URI` is set — perfect for free
  deploys where you can't run a DB).
- **Admin:** Protected `/admin` route with login, searchable/sortable/paginated
  submissions table, CSV export, per-row delete.

## Quick start (local)

```bash
# 1) Backend
cd backend
cp .env.example .env
npm install
npm start            # http://localhost:5000

# 2) Frontend (in another terminal)
cd frontend
npm install
npm run dev          # http://localhost:5173 (proxies /api to :5000)
```

Or build the frontend and let the backend serve it (single port):

```bash
cd frontend && npm install && npm run build
cd ../backend && npm install && JWT_SECRET=some-secret npm start
# open http://localhost:5000
```

## Environment variables

| Var | Default | Purpose |
| --- | --- | --- |
| `PORT` | `5000` | HTTP port |
| `JWT_SECRET` | dev placeholder | **Required** in production |
| `MONGODB_URI` | empty | If set, connects to MongoDB. Otherwise in-memory. |
| `ADMIN_USERNAME` | `amol` | Admin login |
| `ADMIN_PASSWORD` | `amol.@` | Admin login (bcrypt-hashed at startup) |

Demo admin credentials: `amol` / `amol.@`.

## Endpoints

Public:
- `GET  /api/health`
- `GET  /api/weather?lat=..&lon=..`
- `POST /api/submissions`  → `{ name, latitude, longitude, consent:"true", weather? }`

Admin (Bearer JWT):
- `POST /api/admin/login`  → `{ username, password }` → `{ token, username }`
- `GET  /api/admin/submissions?page=&limit=&search=&sort=newest|oldest`
- `DELETE /api/admin/submissions/:id`
- `GET  /api/admin/export.csv`

## Security notes

- All input is validated with `express-validator`.
- Passwords are bcrypt-hashed before comparison.
- The admin login is rate-limited.
- The weather proxy hides Open-Meteo's failure modes from the client and falls
  back to a soft payload so users never see a raw "Failed to fetch" message.
- The submission endpoint requires `consent: "true"` server-side as well.
- `helmet` is enabled for sensible HTTP security headers.
- Tokens are short-lived (6h) and stored client-side in `localStorage`.
