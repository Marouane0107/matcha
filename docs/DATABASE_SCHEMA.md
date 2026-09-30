# Database Schema

Status: planning only. There are no migrations, business queries or seed logic.
Oussama owns the database design; both developers review public contract effects.

Use PostgreSQL and raw SQL only. No ORM, including Prisma, Sequelize, TypeORM,
Drizzle or Mongoose. `pg` is installed as the PostgreSQL driver, not an ORM.

Prepared/parameterized queries must be used to prevent SQL injection. Dynamic
identifiers such as sort columns require an explicit allowlist, not interpolation
of user input. Credentials belong only in untracked local environment files.

## Initial Table List

All columns, keys, constraints, indexes, retention rules and relationships are TODO.

| Table | Intended responsibility | Status |
| --- | --- | --- |
| users | Account identity, password hashes and verification state | TODO |
| profiles | Profile attributes, biography, preferences and location | TODO |
| pictures | Uploaded image metadata, ownership and display order | TODO |
| tags | Supported interest tags | TODO |
| user_tags | Association between users and interest tags | TODO |
| likes | Directed likes used to establish mutual interest | TODO |
| profile_views | Profile visit records | TODO |
| blocks | Directed blocking relationships | TODO |
| reports | User reports and review metadata | TODO |
| messages | Persistent messages between authorized connections | TODO |
| notifications | Notification records and read state | TODO |

Decide identifier types, UTC timestamps, uniqueness, foreign keys, deletion rules,
transactions, pagination indexes, and sensitive-data access before migration work.
Decide how connections and verification/reset tokens are represented later; this
list is not a complete final schema. Never store plaintext passwords or tokens
that should be hashed.

## Future File Ownership

- `backend/src/db/migrations/`: ordered schema migrations; runner/rollback policy TODO.
- `backend/src/db/queries/`: parameterized raw SQL access; no business queries yet.
- `backend/src/db/seed/`: development/test data generation; implementation TODO.

The database seed must eventually generate at least 500 distinct profiles. Agree
on diverse, internally consistent test data and a development-only execution guard.
Do not use real personal data or real credentials for seed records.
