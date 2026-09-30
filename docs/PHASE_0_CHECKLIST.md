# Phase 0 Complete — Ready to Code

Review baseline: the existing committed foundation at the start of this Phase 0
task. No application features, SQL queries or socket handlers have been added.
Checks below are marked only after final verification. Hosted settings and local
credentials are operational setup, not unresolved architecture decisions.

## Definition of Ready

- [x] npm install works
- [x] npm run build works
- [x] Shared package works
- [x] Frontend imports @matcha/shared
- [x] Backend imports @matcha/shared
- [x] API routes finalized
- [x] API response format finalized
- [x] Shared types finalized
- [x] Socket event names finalized
- [x] Socket payloads finalized
- [x] Database schema finalized
- [x] Auth strategy finalized
- [x] Error codes finalized
- [x] HTTP status conventions finalized
- [x] Environment examples finalized
- [x] Marouane start guide exists
- [x] Oussama backend guide updated
- [x] Parallel development guide exists
- [x] No secrets tracked
- [x] No ORM installed
- [x] No application feature logic implemented yet

Verified with npm install, npm run build, npm run typecheck, editor diagnostics and
git diff --check. A Vite production bundle of the frontend contract module was
executed and compared with compiled backend exports: identical API_ROUTES,
SOCKET_EVENTS and ERROR_CODES. Coverage checks confirmed 32 unique route paths,
eight event names and 28 error codes against documentation. Current tracked files
and pending additions were checked for secret patterns, blank credential templates,
ignored local environments and forbidden ORM packages. This is not a historical
Git secret audit. npm reported zero vulnerabilities at verification time.

## Final Contract Corrections

- [x] Email changes use password reauthentication, pending email and a hashed,
  one-use 24-hour token; verification atomically replaces the email and revokes
  sessions. Username stays immutable; pending addresses do not reserve ownership.
- [x] Unspecified sexual preference defaults to everyone in the database, shared
  contract and matching rules; omission does not block profile completion/discovery.
- [x] Register/reset require deterministic backend common/dictionary/known-compromised
  password checks using a versioned local denylist, with PASSWORD_TOO_COMMON errors.
- [x] Manual location accepts city/neighborhood, never coordinates; the backend
  resolves an approximate centroid. GPS coordinates require explicit browser consent.
- [x] UNLIKE is created only when unlike breaks a mutual connection, never for
  one-way like removal or blocking.

Reran npm install, npm run typecheck and npm run build in that order after these
corrections: shared, frontend and backend passed; npm reported zero vulnerabilities.
In-memory TypeScript checks accepted both valid location modes and email-change
requests and rejected manual coordinates, missing GPS coordinates and null preference.
Audited current tracked/pending files for secret patterns and credential values,
checked environment ignores and prohibited ORM packages, and verified unchanged
placeholder entrypoints and empty backend feature directories. No feature logic,
dependencies, local secrets, commits or pushes were added by these corrections.

Files modified by this final correction pass:

- shared/contracts/auth.types.ts
- shared/contracts/profile.types.ts
- shared/constants/api-routes.ts
- shared/constants/error-codes.ts
- docs/API_CONTRACT.md
- docs/AUTH_STRATEGY.md
- docs/DATABASE_SCHEMA.md
- docs/SOCKET_EVENTS.md
- docs/MAROUANE_START_HERE.md
- docs/OUSSAMA_BACKEND_GUIDE.md
- docs/PHASE_0_CHECKLIST.md

No unresolved Phase 0 contract decisions remain. The geocoding provider and the
versioned denylist source/license are implementation selections for the location
and auth branches; their ownership, behavior and error contracts are fixed here.

## Decisions Ready for Review

No design decisions are blocked on another meeting. This is the initial baseline
to review, not a claim that either teammate has already approved the PR.

- Three npm workspaces; shared is a compiled CommonJS package with declarations.
- UUID identifiers, UTC timestamps, JSON envelopes and page/limit pagination.
- JWT bearer access tokens in memory only, 15-minute expiry, no refresh tokens;
  reload requires login and logout revokes every device through token_version.
- Hashed one-use verification/reset tokens, Argon2id passwords, no credential values
  in shared code or example env files.
- Owner-only email/birth date/coordinates; authenticated picture reads via blob
  URLs (one supporting GET method on the existing picture path).
- Connections derive from reciprocal likes, blocking removes both likes, and
  messages require a current unblocked connection. Fame is capped incoming likes.
- Typed socket acknowledgements, idempotent message IDs, REST recovery after
  reconnect, no promise of realtime cross-tab read-state synchronization.
- PostgreSQL 16+, 11 business tables, raw SQL only, transactional migrations and
  a small schema_migrations ledger. No database setup runs automatically.

## Manual Setup

Copy the two workspace env templates locally; supply DB, JWT and SMTP credentials
when the relevant feature branch needs them. No local .env files were created by
Phase 0. Configure hosting branch protection with peer review. Review and merge
Phase 0 before both developers branch from main; no commit or push was made here.
CI, actual migrations, database tests, auth libraries, pages and socket logic belong
to subsequent feature branches, not this checklist.

## Change Inventory

Created:

- shared/package.json
- shared/tsconfig.json
- shared/index.ts
- shared/contracts/search.types.ts
- shared/contracts/interaction.types.ts
- shared/constants/api-routes.ts
- shared/constants/error-codes.ts
- frontend/src/services/api/contracts.ts
- backend/src/config/contracts.ts
- docs/AUTH_STRATEGY.md
- docs/MAROUANE_START_HERE.md
- docs/OUSSAMA_BACKEND_GUIDE.md (new; no previous guide existed)
- docs/PARALLEL_DEVELOPMENT.md
- docs/PHASE_0_CHECKLIST.md

Modified:

- package.json
- package-lock.json
- frontend/package.json
- frontend/tsconfig.json
- frontend/vite.config.ts
- backend/package.json
- backend/tsconfig.json
- backend/.env.example
- shared/contracts/api.types.ts
- shared/contracts/auth.types.ts
- shared/contracts/profile.types.ts
- shared/contracts/chat.types.ts
- shared/contracts/notification.types.ts
- shared/constants/socket-events.ts
- docs/API_CONTRACT.md
- docs/DATABASE_SCHEMA.md
- docs/SOCKET_EVENTS.md
- docs/GIT_WORKFLOW.md
- docs/PROJECT_ROADMAP.md
- README.md

Dependencies added: only the local @matcha/shared dependency in frontend and
backend. No new third-party dependencies. The root lockfile records workspace links.
The complete current repository tree is in [README](../README.md).
