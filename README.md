# Matcha

A 42/1337 full-stack dating web application where users can create profiles,
discover compatible users, like/connect with them, chat in real time, and receive
real-time notifications.

This repository currently contains the shared project foundation only. The React
screen is a placeholder, and Express has no application routes. Authentication,
database access, matching, uploads, chat, and notifications are not implemented.

## Team

| Developer | Role | Ownership |
| --- | --- | --- |
| Marouane | Frontend & Realtime Client | React, UI/UX, responsive design, authentication screens, profile/browse/search UI, filters/sorting, image upload UI, GPS/location UI, chat/notifications UI, Socket.IO client, API integration |
| Oussama | Backend & Core | Express, PostgreSQL, raw SQL, authentication, email verification/password reset, profiles API, matching, search/filter/sort, likes/connections, blocks/reports, upload security, location, Socket.IO server, chat persistence, notifications, seeding 500+ profiles |

Phase 0 contracts are finalized for implementation. Both developers review any
subsequent contract changes in a focused pull request.

## Tech Stack

- Frontend: React + Vite + TypeScript, React Router.
- Backend: Node.js + Express + TypeScript.
- Database: PostgreSQL with raw SQL via `pg`. No ORM.
- Realtime: Socket.IO server and client, installed but not connected yet.
- Tooling: npm workspaces, TypeScript, Vite, tsx, concurrently.

## Architecture

```text
Frontend (Marouane)
    | REST API + WebSocket
    v
Backend (Oussama)
    | Parameterized raw SQL
    v
PostgreSQL
```

The frontend never accesses the database directly. The `@matcha/shared` npm
workspace contains only cross-workspace contracts and constants, not server logic
or credentials. `frontend/src/services/api/` will own HTTP transport;
`frontend/src/api/` will own typed endpoint adapters. Only contract exports exist
today; there are no requests, socket connections, or feature implementations.

## Development Setup

Requirements: Node.js 22.20+ and npm 10+. PostgreSQL is needed for future database
work, but the current placeholder server does not connect to it.

Replace `<repository-url>` with the team's Git remote:

```sh
git clone <repository-url> matcha
cd matcha
npm install
cp frontend/.env.example frontend/.env
cp backend/.env.example backend/.env
npm run dev
```

Copy `frontend/.env.example` to `frontend/.env` and `backend/.env.example` to
`backend/.env`. No root `.env` is needed. Example files contain no credentials.
The backend loads its local environment file using Node's native env-file support.
Every `VITE_` variable is public browser configuration: never put secrets there.

Frontend: <http://localhost:5173>. Backend: <http://localhost:3000>. A backend 404 is
expected because no routes exist. Vite chooses another port if 5173 is occupied;
update `FRONTEND_URL` when changing the frontend origin. If port 3000 is occupied,
change `PORT` and both frontend URLs consistently.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Build shared, then watch shared and start frontend/backend; Ctrl+C stops all |
| `npm run dev:frontend` | Build shared, then start Vite |
| `npm run dev:backend` | Build shared, then start Express with tsx watch mode |
| `npm run build` | Build shared first, frontend second, backend last |
| `npm run typecheck` | Build shared declarations, then check all three workspaces |
| `npm run install:all` | Install all three workspaces from the root |
| `npm ci` | Reproduce the committed root lockfile |
| `npm run start --workspace=backend` | Run the compiled backend after building |

Use a single root lockfile. No separate installation in each workspace is needed.
Tests and lint tooling are not configured yet; use build/typecheck as the initial
checks, and add focused tests with each implemented feature.

### Shared Contracts

Use package imports everywhere in frontend/backend, never relative paths into
shared source:

```ts
import type { ApiResponse, UserProfile } from "@matcha/shared";
import { API_ROUTES, SOCKET_EVENTS, ERROR_CODES } from "@matcha/shared";
```

The shared package emits CommonJS runtime constants and TypeScript declarations
to shared/dist. Vite explicitly handles this linked CommonJS workspace; Node uses
its package exports directly. Root build order is shared, frontend, backend.
Backend output now starts at backend/dist/server.js. Run root build before using
workspace-only production scripts. The root dev command watches shared; standalone
frontend/backend dev commands rebuild shared once, so rebuild it after contract edits.
After changing runtime constants, restart Vite with `npm run dev --workspace=frontend
-- --force` to invalidate its prebundled dependency cache. The shared watcher alone
is not a guarantee that Vite's optimized dependency cache has refreshed.

Interfaces are contracts, not runtime validators. IDs are UUID strings; instants
are ISO 8601 UTC strings. UserProfile is owner-only; PublicProfile omits email,
birth date and exact coordinates. Auth uses memory-only bearer JWTs, 15-minute
expiry, no refresh tokens and all-device logout. See the final docs below.

## Start Coding

- Marouane: [frontend start guide](docs/MAROUANE_START_HERE.md), branch `feat/auth-ui`.
- Oussama: [backend start guide](docs/OUSSAMA_BACKEND_GUIDE.md), branch
  `feat/database-foundation`, then `feat/auth-api`.
- Both: [parallel development](docs/PARALLEL_DEVELOPMENT.md) and the
  [Phase 0 readiness checklist](docs/PHASE_0_CHECKLIST.md).

### Manual Configuration

- Oussama: provision PostgreSQL 16+ and a least-privilege database user when Phase 1
  starts. Fill local DB values and follow the documented migration workflow.
- Oussama: configure a local JWT secret and email provider before implementing
  authentication. Those values are unused by the current server.
- Marouane: keep public API/socket URLs consistent with the backend address.
- Both: review Phase 0 and configure GitHub main-branch protection requiring
  a pull request and review from the other developer. CI is not configured yet.

The frontend env template contains only VITE_API_URL and VITE_SOCKET_URL. The
backend template defines PORT, NODE_ENV, DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD,
JWT_SECRET, JWT_EXPIRES_IN, EMAIL_HOST/EMAIL_PORT/EMAIL_USER/EMAIL_PASSWORD and
FRONTEND_URL. JWT_EXPIRES_IN=15m is a non-secret policy default; credential fields
remain blank. PostgreSQL defaults to localhost:5432, database matcha. SMTP and
startup-validation requirements are in the backend guide. VITE_API_URL includes
/api, while route constants already contain /api: adapters resolve against its
origin, not by concatenating two prefixes. No secret belongs in a VITE_ variable.

## Git Workflow

Nobody works directly on `main`. Use a small branch per feature, never permanent
frontend/backend branches.

Frontend examples: `feat/auth-ui`, `feat/profile-ui`, `feat/browse-ui`, `feat/chat-ui`.
Backend examples: `feat/database-foundation`, `feat/auth-api`, `feat/profile-api`,
`feat/matching-api`, `feat/socket-server`.

```text
main -> feature branch -> commit -> push -> pull request
     -> review by the other developer -> merge to main
```

See [Git workflow](docs/GIT_WORKFLOW.md) for commands and review expectations.

## Security

Never commit:

- `.env` files (only credential-free `.env.example` templates belong in Git).
- API keys.
- Passwords.
- Database credentials.
- JWT secrets.
- Email credentials.

Uploads, dependencies, and build output are ignored. Review staged changes before
every commit. Use prepared/parameterized queries, never interpolated SQL. Prisma,
Sequelize, TypeORM, Drizzle, Mongoose, and all other ORMs are prohibited.

## Documentation

- [Final API contract and validation](docs/API_CONTRACT.md)
- [Auth strategy](docs/AUTH_STRATEGY.md)
- [Final database design](docs/DATABASE_SCHEMA.md)
- [Socket event dictionary](docs/SOCKET_EVENTS.md)
- [Git workflow](docs/GIT_WORKFLOW.md)
- [Project roadmap](docs/PROJECT_ROADMAP.md)
- [Script policy](scripts/README.md)

## Repository Tree and File Inventory

All files below are foundation files. `.gitkeep` files retain placeholder
directories in Git. Generated `node_modules/` and `dist/` are omitted. The final
Phase 0 change inventory is recorded in [the checklist](docs/PHASE_0_CHECKLIST.md).

```text
matcha/
|-- .editorconfig
|-- .env.example
|-- .gitignore
|-- README.md
|-- package.json
|-- package-lock.json
|-- frontend/
|   |-- .env.example
|   |-- index.html
|   |-- package.json
|   |-- tsconfig.json
|   |-- vite.config.ts
|   |-- public/
|   |   `-- .gitkeep
|   `-- src/
|       |-- App.tsx
|       |-- main.tsx
|       |-- api/
|       |   `-- .gitkeep
|       |-- assets/
|       |   `-- .gitkeep
|       |-- components/
|       |   `-- .gitkeep
|       |-- features/
|       |   |-- auth/
|       |   |   `-- .gitkeep
|       |   |-- profile/
|       |   |   `-- .gitkeep
|       |   |-- browse/
|       |   |   `-- .gitkeep
|       |   |-- search/
|       |   |   `-- .gitkeep
|       |   |-- chat/
|       |   |   `-- .gitkeep
|       |   `-- notifications/
|       |       `-- .gitkeep
|       |-- hooks/
|       |   `-- .gitkeep
|       |-- layouts/
|       |   `-- .gitkeep
|       |-- pages/
|       |   `-- .gitkeep
|       |-- services/
|       |   |-- api/
|       |   |   |-- contracts.ts
|       |   |   `-- .gitkeep
|       |   `-- socket/
|       |       `-- .gitkeep
|       |-- store/
|       |   `-- .gitkeep
|       |-- types/
|       |   `-- .gitkeep
|       `-- utils/
|           `-- .gitkeep
|-- backend/
|   |-- .env.example
|   |-- package.json
|   |-- tsconfig.json
|   |-- uploads/
|   |   `-- .gitkeep
|   `-- src/
|       |-- app.ts
|       |-- server.ts
|       |-- config/
|       |   |-- contracts.ts
|       |   `-- .gitkeep
|       |-- controllers/
|       |   `-- .gitkeep
|       |-- db/
|       |   |-- migrations/
|       |   |   `-- .gitkeep
|       |   |-- queries/
|       |   |   `-- .gitkeep
|       |   `-- seed/
|       |       `-- .gitkeep
|       |-- middleware/
|       |   `-- .gitkeep
|       |-- routes/
|       |   `-- .gitkeep
|       |-- services/
|       |   `-- .gitkeep
|       |-- sockets/
|       |   `-- .gitkeep
|       |-- types/
|       |   `-- .gitkeep
|       `-- utils/
|           `-- .gitkeep
|-- shared/
|   |-- package.json
|   |-- tsconfig.json
|   |-- index.ts
|   |-- contracts/
|   |   |-- api.types.ts
|   |   |-- auth.types.ts
|   |   |-- profile.types.ts
|   |   |-- search.types.ts
|   |   |-- interaction.types.ts
|   |   |-- chat.types.ts
|   |   `-- notification.types.ts
|   `-- constants/
|       |-- api-routes.ts
|       |-- error-codes.ts
|       `-- socket-events.ts
|-- docs/
|   |-- API_CONTRACT.md
|   |-- AUTH_STRATEGY.md
|   |-- DATABASE_SCHEMA.md
|   |-- SOCKET_EVENTS.md
|   |-- GIT_WORKFLOW.md
|   |-- MAROUANE_START_HERE.md
|   |-- OUSSAMA_BACKEND_GUIDE.md
|   |-- PARALLEL_DEVELOPMENT.md
|   |-- PHASE_0_CHECKLIST.md
|   `-- PROJECT_ROADMAP.md
`-- scripts/
    `-- README.md
```
