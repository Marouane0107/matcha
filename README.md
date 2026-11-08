# Matcha

A full-stack dating web application built for the 42/1337 curriculum. Users create
profiles, discover compatible people, like and connect, chat in real time, and
receive real-time notifications.

## Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, Vite 7, TypeScript, React Router 7 |
| Backend | Node.js, Express 4, raw SQL via `pg` (no ORM) |
| Database | PostgreSQL |
| Realtime | Socket.IO (server + client) |
| Tooling | npm workspaces, TypeScript, Vite, tsx, concurrently |

The repository is an npm monorepo with three workspaces:

- `shared/` → `@matcha/shared`: cross-cutting TypeScript contracts, constants, and types (the single source of truth for API shapes).
- `frontend/` → `@matcha/frontend`: the React single-page app.
- `backend/` → `backend`: the Express + Socket.IO API.

## Prerequisites

- **Node.js** ≥ 22.20.0 (per `engines`) and **npm** ≥ 10. (Also runs on Node 20.19+.)
- **PostgreSQL** 15+ running locally (or via the included `docker-compose.yml`).

## Environment Variables

Copy each template to a real `.env` file. **Never commit `.env` files** — only the
credential-free `.env.example` templates belong in Git.

### `backend/.env.example`

| Key | Purpose |
| --- | --- |
| `PORT` | Backend HTTP port (default `3000`). |
| `CORS_ORIGIN` | Allowed frontend origin for CORS and Socket.IO (default `http://localhost:5173`). |
| `NODE_ENV` | `development` / `test` / `production`. `db:reset` and `seed` refuse to run outside dev/test. |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | PostgreSQL connection details. |
| `SEED_DEFAULT_PASSWORD` | Shared password for all seeded accounts (development only). |
| `JWT_SECRET` | HS256 signing secret — at least 32 random bytes. |
| `JWT_EXPIRES_IN` | Access-token lifetime (e.g. `15m`). |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` | Email delivery for verification and password-reset links. |

### `frontend/.env.example`

| Key | Purpose |
| --- | --- |
| `VITE_API_URL` | Base URL of the backend REST API (includes `/api`). |
| `VITE_SOCKET_URL` | Backend WebSocket origin (no `/api`). |
| `VITE_AUTH_MOCK`, `VITE_PROFILE_MOCK`, `VITE_INTERACTIONS_MOCK` | Set `true` to use in-memory mock services during development. |
| `VITE_INTERACTIONS_SCENARIO` | Mock scenario selector for interactions. |

Every `VITE_` variable is public browser configuration — **never put secrets there**.

## Database Setup

1. Create the database and apply the base schema:
   ```sh
   createdb matcha_db
   psql -d matcha_db -f backend/db/schema.sql
   ```
2. Apply the chat/notifications migration:
   ```sh
   psql -d matcha_db -f backend/db/migrations/0001_chat_notifications.sql
   ```
3. Seed 520 deterministic profiles (includes the verified tester account):
   ```sh
   npm run seed --workspace=backend
   ```

To wipe and rebuild from scratch: `npm run db:reset --workspace=backend && npm run seed --workspace=backend`.

Alternatively, start Postgres with Docker (auto-loads `schema.sql`):
```sh
cd backend && docker compose up -d
```

## Running the App

```sh
npm install
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
# fill in DB credentials + JWT_SECRET (and SMTP, optionally) in backend/.env
npm run dev
```

- Frontend: <http://localhost:5173>
- Backend: <http://localhost:3000>

Run them separately with `npm run dev:frontend` or `npm run dev:backend`.

### Build & checks

| Command | Purpose |
| --- | --- |
| `npm run build` | Build shared, then frontend, then backend. |
| `npm run typecheck` | Type-check all three workspaces. |
| `npm test --workspace=@matcha/frontend` | Run the frontend test suite. |

## Development Workflow — Email Verification & Password Reset

Verification and reset emails are sent over SMTP. When SMTP is unconfigured, mail
delivery is skipped (logged server-side), so the practical way to log in locally is
the seeded verified account:

- **Username** `matcha_tester` · **Password** `Matcha123!` (all seeded accounts share this password).

Verification/reset tokens are single-use, stored only as SHA-256 digests (the raw
token is never persisted), and expire after 24 h (verify) / 1 h (reset). To exercise
the verify/reset flows end-to-end, point `SMTP_*` at a real account or a local mail
catcher.

## Architecture

```text
Frontend (React SPA)
    │  REST (JSON)  +  WebSocket (Socket.IO)
    ▼
Backend (Express + Socket.IO)
    ├─ routes/       HTTP routing (mounted under /api/*)
    ├─ controllers/  request handlers
    ├─ middleware/   auth, upload, rate limiting
    ├─ sockets/      socket auth, presence, chat, notifications
    └─ config/       DB pool, shared constants, env
    │  parameterized raw SQL (pg)
    ▼
PostgreSQL
```

- The frontend never accesses the database directly. It uses `@matcha/shared`
  contracts and typed API/socket adapters.
- REST handles CRUD, search, and history; Socket.IO handles realtime chat,
  presence, and notification push.

Full contracts live in `docs/`: `API_CONTRACT.md`, `AUTH_STRATEGY.md`,
`DATABASE_SCHEMA.md`, `SOCKET_EVENTS.md`, `GIT_WORKFLOW.md`.

## Technical Design Choices

- **Fame rating** — a user's fame is their incoming-like count, capped at 100
  (`LEAST(100, like_count)`).
- **Matching eligibility** — a profile is shown only if neither user blocked the
  other and their gender ↔ sexual-preference preferences are mutually compatible
  (`everyone` matches all; otherwise `men`→man, `women`→woman). Blocks take precedence.
- **Search/sort** — sort keys (`distance`, `age`, `fame`, `commonTags`) and
  directions are validated against an allow-list; distance uses the Haversine formula.
- **Location** — profiles store latitude/longitude plus a human-readable string.
  The frontend supports GPS and manual entry; matching uses the coordinates.
- **Realtime** — Socket.IO connections authenticate via JWT in the handshake; each
  user is joined to a `user:<id>` room; messages carry a `client_message_id` for
  idempotent retry/deduplication; presence is in-memory with `last_seen` written on
  final disconnect.
- **Security** — parameterized raw SQL only, bcrypt password hashing (12–128 chars,
  letter + number), JWT bearer auth, server-side image decoding via Sharp, rate
  limiting on sensitive routes, and sanitized error responses. See `docs/AUTH_STRATEGY.md`.

## Team

| Developer | Ownership |
| --- | --- |
| Marouane | Frontend & realtime client |
| Oussama | Backend, database, auth/security, realtime server |

See `docs/DEFENSE.md` for the evaluation defense division.
