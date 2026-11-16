# Matcha Backend

Current setup and verification: [root README](../README.md). Routes and payloads follow
[API_CONTRACT](../docs/API_CONTRACT.md) and [SOCKET_EVENTS](../docs/SOCKET_EVENTS.md).

The runtime is JavaScript ESM with Express, parameterized PostgreSQL queries and
authenticated Socket.IO. Build checks syntax; typecheck checks JavaScript through
TypeScript. Start runs `src/server.js`, not a compiled placeholder.

Authentication uses Argon2id, memory-only 15-minute bearer JWTs, persisted session
versions and immediate socket revocation. Login accepts `username` and `password`.
Verification/reset links carry fragment tokens and use POST endpoints. JSON
responses use `{ success, data, error }`. Logout invalidates all devices.

Run commands from the repository root with `--workspace=backend`. Configure actual
DB/SMTP values, `JWT_SECRET` (32+ random bytes) and `CORS_ORIGIN` locally. Use
`npm run migrate --workspace=backend` for the additive migration. Seed/reset refuse
unconfirmed or non-local dev/test targets. Seeded images require Picsum access;
uploaded images are private local WebP files.

Manual location uses the offline MIT-licensed `city-timezones` dataset plus public
preset centroids. Region/country qualifiers disambiguate cities. Neighborhood is a
user-provided label; manual distance is approximate at city level. No external
geocoder or silent IP inference is used.

Use the executable [schema](db/schema.sql) and
[additive migration](db/migrations/0001_mandatory.sql) for database setup.
All tests and local evaluation instructions are in the root README.
