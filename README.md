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

Both developers review changes to shared contracts before implementation.

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

The frontend never accesses the database directly. `shared/` contains only
cross-workspace contracts and constants, not server logic or credentials.
`frontend/src/services/api/` will own HTTP transport; `frontend/src/api/` will own
typed endpoint adapters. Both are empty until contracts are agreed.

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
| `npm run dev` | Start both workspaces; stop both with Ctrl+C |
| `npm run dev:frontend` | Start Vite only |
| `npm run dev:backend` | Start Express with tsx watch mode |
| `npm run build` | Typecheck frontend, bundle it, and compile backend/shared code |
| `npm run typecheck` | Check both workspaces and shared contracts without emitting |
| `npm run install:all` | Install both workspaces from the root |
| `npm ci` | Reproduce the committed root lockfile |
| `npm run start --workspace=backend` | Run the compiled backend after building |

Use a single root lockfile. No separate installation in each workspace is needed.
Tests and lint tooling are not configured yet; use build/typecheck as the initial
checks, and add focused tests with each implemented feature.

### Shared Contracts

Both TypeScript configurations include `shared/`. Use relative imports; it is not
a third npm workspace. Examples from files directly under either `src/`:

```ts
import type { ApiResponse } from "../../shared/contracts/api.types";
import { CLIENT_TO_SERVER_EVENTS } from "../../shared/constants/socket-events";
```

Adjust relative depth from nested files. Shared modules must stay compatible with
browser and Node environments. Backend compilation preserves the directory layout
under `backend/dist/`, so its entrypoint is `backend/dist/backend/src/server.js`.
The start script already accounts for this. Interfaces are provisional, not
runtime validators. IDs are strings and timestamps are ISO 8601 UTC strings for
now; both developers must agree on changes before consuming them. `UserProfile`
is owner-only; `PublicProfile` deliberately excludes email. Auth transport, final
profile fields, notification variants, and socket payloads remain TODO.

### Manual Configuration

- Oussama: provision PostgreSQL and a least-privilege database user when Phase 1
  starts. Fill local DB values, then agree on a migration/seed workflow.
- Oussama: configure a local JWT secret and email provider before implementing
  authentication. Those values are unused by the current server.
- Marouane: keep public API/socket URLs consistent with the backend address.
- Both: agree on contracts and configure GitHub main-branch protection requiring
  a pull request and review from the other developer. CI is not configured yet.

## Git Workflow

Nobody works directly on `main`. Use a small branch per feature, never permanent
frontend/backend branches.

Frontend examples: `feat/auth-ui`, `feat/profile-ui`, `feat/browse-ui`, `feat/chat-ui`.
Backend examples: `feat/database`, `feat/auth-api`, `feat/profile-api`,
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

- [API contract template](docs/API_CONTRACT.md)
- [Database planning](docs/DATABASE_SCHEMA.md)
- [Socket event dictionary](docs/SOCKET_EVENTS.md)
- [Git workflow](docs/GIT_WORKFLOW.md)
- [Project roadmap](docs/PROJECT_ROADMAP.md)
- [Script policy](scripts/README.md)

## Repository Tree and File Inventory

All files below are foundation files. `README.md` and `.gitignore` existed before
setup and were updated; every other listed file was added. `.gitkeep` files retain
empty directories in Git. Generated `node_modules/` and `dist/` are omitted.

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
|   |-- contracts/
|   |   |-- api.types.ts
|   |   |-- auth.types.ts
|   |   |-- profile.types.ts
|   |   |-- chat.types.ts
|   |   `-- notification.types.ts
|   `-- constants/
|       `-- socket-events.ts
|-- docs/
|   |-- API_CONTRACT.md
|   |-- DATABASE_SCHEMA.md
|   |-- SOCKET_EVENTS.md
|   |-- GIT_WORKFLOW.md
|   `-- PROJECT_ROADMAP.md
`-- scripts/
    `-- README.md
```
