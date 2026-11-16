# Matcha

A 42/1337 full-stack dating web application where users can create profiles,
discover compatible users, like/connect with them, chat in real time, and receive
real-time notifications.

Authentication, profiles, protected photos, location, discovery, interactions,
persisted chat, presence and notifications are implemented. The backend uses
parameterized raw PostgreSQL queries with no ORM. See Subject Limits below before
claiming compliance with the assigned Intra subject.

## Requirements and Installation

Requirements: Node.js 22.20+, npm 10+, PostgreSQL 16+, and SMTP (a local Mailpit
catcher works). PostgreSQL CLI tools (`createdb`, `psql`) are needed for the database
commands below. The backend is JavaScript ESM checked by TypeScript. Run these
commands from the repository root:

```sh
npm ci
cp frontend/.env.example frontend/.env
cp backend/.env.example backend/.env
npm run build --workspace=@matcha/shared
```

Do not overwrite existing local environment files. Install dependencies only at
the root using the single committed lockfile.

Configure backend `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`,
`DB_NAME=matcha_dev`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` and
`CORS_ORIGIN`. Generate `JWT_SECRET` locally with at least 32 random bytes (for
example `openssl rand -hex 32`); keep it private. Set `JWT_EXPIRES_IN=15m`.
The backend uses `dotenv` in its workspace. No root environment file is needed.

Configure `frontend/.env` with `VITE_API_URL=http://localhost:3000/api` and
`VITE_SOCKET_URL=http://localhost:3000`. Leave every `VITE_*_MOCK` flag `false`.
Set backend `PORT=3000`, `NODE_ENV=development` and
`CORS_ORIGIN=http://localhost:5173` for those defaults. Use your own credentials;
never commit `.env` files, signing secrets, tokens or passwords.

## Database and Seed

Explicitly create a **fresh local** database with your PostgreSQL administrator.
These commands use your PostgreSQL CLI connection (`PGHOST`, `PGPORT`, `PGUSER`
and local password configuration). Point it at the same server/user as backend
`DB_*`, and set backend `DB_NAME=matcha_dev` before migration:

```sh
createdb matcha_dev
psql -v ON_ERROR_STOP=1 -d matcha_dev -f backend/db/schema.sql
npm run migrate --workspace=backend
```

For an existing database, back it up and run **only the additive migration**, not
the fresh schema or reset script. PostgreSQL must allow `uuid-ossp`. The migration
refuses conflicting unique data rather than silently deleting it.

Configure a private `SEED_DEFAULT_PASSWORD` locally, then seed 520 evaluation
profiles only into this explicitly selected development database:

```sh
NODE_ENV=development DB_CONFIRM_NAME=matcha_dev npm run seed --workspace=backend
psql -v ON_ERROR_STOP=1 -d matcha_dev -c 'SELECT count(*), count(DISTINCT user_id) FROM profiles;'
```

Seed/reset require a local host, `dev`/`test` in `DB_NAME`, and exact
`DB_CONFIRM_NAME=DB_NAME`. Never run them against production. The primary tester
is `matcha_tester`; its password is your locally configured seed password. Run the
seed once on a fresh database; repeating it causes duplicate-user errors rather
than updating existing accounts. Picsum network access is needed for seeded photos; user uploads are private
local WebP files. Keep uploaded files together with their database.

## Startup and Email

```sh
npm run dev
```

Frontend: <http://localhost:5173>. Backend: <http://localhost:3000/health>.
Keep `CORS_ORIGIN`, `VITE_API_URL` (including `/api`) and `VITE_SOCKET_URL` aligned
when changing ports. All mock flags must be false for integration/evaluation.
Never place secrets in `VITE_*` variables.

Configure SMTP before registering. For a local Mailpit catcher, the usual ports
are SMTP `1025` and HTTP `8025`; use the ports actually configured on your machine.
Set `SMTP_HOST`, `SMTP_PORT`, a synthetic sender address in `SMTP_USER`, and leave
`SMTP_PASSWORD` set to your own non-empty disposable local credential. Configure
the catcher to accept those credentials (Mailpit supports accepting arbitrary local
SMTP authentication). The backend always supplies SMTP authentication; a blank
password fails against a server advertising AUTH. For a provider, use its actual
SMTP credentials. Port `465` enables implicit TLS. `SMTP_USER` also supplies the
sender address. No external mailbox is needed with a local catcher.

Open verification/reset/email-change links in the catcher's web UI. They target
`CORS_ORIGIN` with a fragment token; the frontend removes it from browser history.

The backend starts from `backend/src/server.js`; its build checks JavaScript
syntax. Shared declarations/runtime constants must be built first. Root dev
watches shared, frontend and backend; workspace-only dev commands do not watch
shared. Production hosting needs an SPA fallback and authenticated `/api` and
Socket.IO forwarding over HTTPS.

For deployment, run `NODE_ENV=production npm run build`, serve `frontend/dist`
with SPA fallback, and run `NODE_ENV=production npm start --workspace=backend`.
Do not build a release with `NODE_ENV=test` or `development`: Vite then enables
development behavior, including explicitly enabled test mocks.
Workspace-only development commands are
`npm run dev:frontend` and `npm run dev:backend`. After adding shared runtime
exports, rebuild shared and restart Vite with
`npm run dev --workspace=frontend -- --force` to clear stale prebundles.

## Verification

```sh
npm ci
npm run build
npm run typecheck
npm test --workspace=frontend
npm test --workspace=backend
npm run build --workspace=@matcha/shared
git diff --check
npm audit
```

Root build/typecheck cover every workspace. Real integration tests additionally
require a separately initialized **local test database**, SMTP capture and
Mailpit's HTTP API. With your local PostgreSQL CLI connection configured:

```sh
createdb matcha_test
psql -v ON_ERROR_STOP=1 -d matcha_test -f backend/db/schema.sql
NODE_ENV=test DB_HOST=127.0.0.1 DB_NAME=matcha_test npm run migrate --workspace=backend
NODE_ENV=test DB_HOST=127.0.0.1 DB_NAME=matcha_test npm run migrate --workspace=backend
NODE_ENV=test DB_HOST=127.0.0.1 DB_NAME=matcha_test \
MAILPIT_API=http://127.0.0.1:8025 npm run test:integration --workspace=backend
```

Supply matching `DB_PORT`, database credentials and SMTP catcher values in the
backend environment or command environment; override `MAILPIT_API` for its actual
HTTP port. The suite rejects non-local/non-test database targets, starts its own
ephemeral API and uses real HTTP, PostgreSQL, SMTP and Socket.IO. It creates random
accounts and retains rows/uploads in the isolated DB. No reset is needed.

All tests and their development mocks/fixtures are intentionally retained. The
frontend suite verifies production exclusion even with mock flags set true.
No production adapter falls back to mock data.

## Current Behavior

- Parameterized PostgreSQL queries only; no ORM. API/socket payloads follow shared
  contracts and are validated by the existing frontend services.
- Argon2id passwords, purpose-bound one-use email tokens, 15-minute memory-only
  JWTs, persisted session versions and all-device revocation/disconnection.
- Protected images, atomic five-photo limit, real matching/social operations,
  persisted idempotent chat, notifications and multi-tab presence.
- GPS is requested only after consent. After permission denial, if no location is
   saved and no manual draft is being entered, the server attempts a coarse lookup
   of the connection IPv4 using bundled offline data. No device GPS permission is
   bypassed, no IP is sent to a third party, and the raw IP is not stored in profiles.
   Approximate coordinates are rounded to 0.1 degree, owner-only, and marked
   `approximate`. Existing saved locations are never replaced automatically.
- Manual city/neighborhood correction remains available. Unknown/ambiguous cities
   are rejected; region/country qualifiers disambiguate. Manual coordinates are city
   centroids, including when a neighborhood label is provided.
- Production builds eliminate explicit DEV-only mock adapters. Do not submit with
  development mock flags enabled.

## Two-Account Evaluation

1. Open two independent browser sessions (separate profiles or a private window),
   with all mock flags false. Register two accounts with your own passwords and
   verify their email links in the SMTP catcher. Alternatively use `matcha_tester`
   and `kevin_beer_1` with your local seed password; seeded peers start connected
   and do not exercise initial registration/likes.
2. Complete new profiles: names, adult birth date, gender, biography, at least one
   interest, saved location and a main photo. Choose compatible preferences such
   as `everyone`. Confirm protected picture rendering; anonymous picture requests
   must fail.
3. Search for each other or open `/profiles/<username>` while logged in. Check
   profile visits and notifications, then like in both directions to connect.
4. Open Messages and exchange messages both ways. Check notifications outside the
   conversation, mark them read, and reopen history. Reloading requires login
   again because access tokens live only in memory.
5. Unlike one account: chat/history must be denied until both like again. Block
   the peer: profile/photo/chat access and notifications from the peer must be
   restricted. Unblocking must not restore likes or the connection.
6. Log out and confirm all devices/sockets for that account are revoked and an old
   bearer token fails. Verify password recovery, and repeat with current Chrome
   and Firefox and a narrow mobile viewport.

## Subject Limits

The assigned Intra subject (reported version 6.1) remains unavailable. Complete
subject compliance is **not certified**. The available
[version 5.1 mirror](https://raw.githubusercontent.com/42-matcha-dev/42-matcha/develop/project/en.subject.pdf),
IV.2, requires an alternative approximate location when GPS is declined,
"even without their explicit consent." It does not prescribe IP as the technology.
The permission-denial fallback implements that available mandatory requirement on
supported public IPv4 connections; exact assigned-version compliance is unverified.

IP lookup is best-effort: loopback/private/reserved IPs, native IPv6, missing or
unmapped data return `422 LOCATION_REQUIRED` without inventing a location. Manual
entry remains usable. Only `req.socket.remoteAddress` is used; forwarded headers
are intentionally ignored. A localhost or private reverse proxy therefore cannot
provide the user's public address to this implementation. Do not enable broad
proxy-header trust to hide that limitation. Test public-connection deployment
before submission; proxy/IPv6 coverage remains a limitation.

The pinned MIT-licensed `fast-geoip` package includes local GeoLite-derived data
(about 158 MiB installed). This product includes GeoLite data created by MaxMind,
available from <https://www.maxmind.com/>. IP datasets can be stale or inaccurate;
keep the pinned provider/data reviewed and allow manual correction. No lookup
request or data download occurs at runtime. Rerun the additive migration before
starting an existing database: it widens the source-mode column for `approximate`.

Firefox must be exercised on a host with its runtime dependencies; a Chromium pass
does not establish Firefox compatibility.

## Reference

- [API contracts](docs/API_CONTRACT.md)
- [Authentication strategy](docs/AUTH_STRATEGY.md)
- [Database design](docs/DATABASE_SCHEMA.md) and executable [schema](backend/db/schema.sql)
- [Socket events](docs/SOCKET_EVENTS.md)
- [Git workflow](docs/GIT_WORKFLOW.md)
- [Script safety](scripts/README.md)

Frontend feature handoffs retain useful test/mocking guidance. Local audit reports
are deliberately excluded from submission; installation does not depend on them.
