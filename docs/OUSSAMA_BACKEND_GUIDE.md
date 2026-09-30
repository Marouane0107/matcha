# Oussama: Backend Start Guide

Owner: Backend & Core. Start with `feat/database-foundation`, then `feat/auth-api`.
Do not begin matching, chat or notifications yet. Phase 0 defines contracts only;
there is no connection, SQL business query, migration or route implementation.

## First Branch: feat/database-foundation

1. Provision PostgreSQL 16+ and a least-privilege application role. Configure the
   untracked backend/.env; never commit credentials.
2. Add src/db/connection.ts with one pg Pool, bounded pool size, parameterized
   access, explicit timeouts and graceful shutdown. No connection per request.
3. Create ordered raw SQL migrations for [the schema](DATABASE_SCHEMA.md), including
   the schema_migrations ledger and required indexes/constraints.
4. Add explicit npm database scripts (db:migrate, db:status and db:seed later).
   Do not run migrations/seeds as install or server-start side effects.
5. Establish query-module boundaries and transaction helper ownership below.
6. Add centralized error handling that emits ApiResponse errors without stack
   traces or query text, plus explicit request validation helpers.
7. Test a fresh migration run, a repeat no-op run, uniqueness/check/FK constraints,
   rollback on failure and parameterized query behavior in a disposable database.

## Raw SQL Ownership

Future layout, intentionally not generated as empty business implementations now:

```text
backend/src/db/
|-- connection.ts
|-- migrations/
|   `-- 0001_initial.sql
|-- queries/
|   |-- auth.queries.ts
|   |-- profile.queries.ts
|   |-- search.queries.ts
|   |-- interaction.queries.ts
|   |-- chat.queries.ts
|   `-- notification.queries.ts
`-- seed/
```

Only db/queries modules contain SQL business queries. connection.ts owns pool
construction. Controllers parse/validate HTTP inputs and map responses; services
own business rules and transaction boundaries; query modules accept a pool client
or query executor and return typed rows. Explicit row-to-DTO mapping omits private
fields and converts dates/numerics deliberately. Never expose password hashes.

Use `$1`, `$2`, `$3` placeholders and separate value arrays for every untrusted
value. Never concatenate user data. Dynamic column names/directions are selected
from hard-coded maps; placeholders cannot parameterize identifiers. Use the same
checked-out client for BEGIN, all statements, COMMIT/ROLLBACK, and release it in
finally. Never mix pool.query into an active transaction. Use the documented
ascending user-ID row-lock order for pair mutations.

No ORM: Prisma, Sequelize, TypeORM, Drizzle, Mongoose and equivalents are forbidden.
`pg` is the driver. Pick additional auth/upload libraries only in their feature
branches after checking subject compatibility; none are needed in Phase 0.

## Migration Policy

Use immutable numbered SQL files, execute unapplied migrations in filename order,
record version and SHA-256 checksum in schema_migrations, reject checksum changes,
and serialize runners using a PostgreSQL advisory lock. Each migration and ledger
insert share a transaction. Failed migrations roll back and do not advance the
ledger. Corrections use a new forward migration; no automatic production down/reset
command. Development reset must be explicit and refuse NODE_ENV=production.
Separate schema-owner migration credentials from the runtime role when deploying.

## Second Branch: feat/auth-api

Implement the ten auth routes from API_ROUTES using the shared request types.
Follow [Auth strategy](AUTH_STRATEGY.md) exactly: Argon2id passwords, 15-minute
bearer JWTs, memory-only frontend tokens, no refresh flow, token_version revocation,
hashed single-use verification/reset tokens and non-enumerating email recovery.
Socket disconnection on logout/reset must be added when the socket layer exists;
REST token_version checks enforce revocation from the first auth release.

Email change is mandatory: password reauthentication, pending address and hashed
24-hour one-use token, followed by atomic verification/promotion and all-device
revocation. Username remains immutable. Apply the schema consistency constraints,
active-email unique constraint and conflict cleanup; pending addresses do not reserve
ownership. Test invalid current password, replaced/expired/reused tokens, two users
claiming one email, concurrent reset/change, unchanged email before verification,
and old reset/JWT rejection after success. Future sockets disconnect on email change.

Implement the deterministic local common/dictionary/compromised-password denylist
check from AUTH_STRATEGY.md for register/reset, in addition to length/letter/number
rules. Bundle a versioned licensed list, fail startup if unavailable, and test
normalization and predictable numeric affixes. Return PASSWORD_TOO_COMMON; frontend
validation cannot replace this check. No heavy dependency is required in Phase 0.

For the profile/location branches, sexual_preference defaults to everyone and is
NOT NULL; omission never blocks discovery. Gender remains nullable until supplied.
Manual requests carry city/neighborhood only: the backend location service resolves
an approximate locality centroid before persistence. Reject client coordinates in
manual mode. GPS requests use consent-sourced browser coordinates. Test ambiguous
places and provider failure with no partial write; choose the geocoding provider
during implementation without changing this API contract. Users never type coordinates.
For later interactions, emit UNLIKE only on an actual mutual-connection breakup,
never on one-way like removal or blocking; test all three transitions.

Validate environment configuration before listening once auth/DB are active:
PORT 1..65535, NODE_ENV development/test/production, DB_PORT 1..65535, required DB
name/user/password, JWT_SECRET >=32 random bytes, JWT_EXPIRES_IN=15m, valid
FRONTEND_URL, and email host/port/user/password. Local placeholder boot currently
does not require unused DB/auth/email values.

Use SMTP port 587 with mandatory STARTTLS or port 465 with implicit TLS; reject
other production settings. Use EMAIL_USER as the sender address. Never disable
certificate validation. Verification/reset links derive only from FRONTEND_URL,
not an untrusted Host header. Don't log tokens, headers, passwords or email bodies.

Implement CORS and error middleware according to the contract; register static
profile routes before username routes. Do not add endpoint variants independently.
Test auth expiry/revocation, token one-use and expiry, duplicate accounts, invalid
inputs and private-field exclusion. Coordinate the first real auth integration
with Marouane; do not wait for his UI to write backend tests.

## Seed and Later Work

Phase 11 seeds at least 500 distinct synthetic profiles, coherent interests and
locations and representative interactions. Require a development/test environment
and explicit command, never startup seeding. After auth integration move to
feat/profile-api, not matching/chat/notifications. See [parallel map](PARALLEL_DEVELOPMENT.md).
