# Database Schema

Final initial design, not migrations or business queries. Target PostgreSQL 16+
with `pg` and raw SQL only. No Prisma, Sequelize, TypeORM, Drizzle, Mongoose or other
ORM. The [API contract](API_CONTRACT.md) controls wire formats; SQL uses snake_case.

## Global Conventions

- UUID primary keys use `gen_random_uuid()` unless the key is also a foreign key.
- Every column is NOT NULL unless explicitly marked nullable. `created_at` is
  timestamptz NOT NULL DEFAULT now() on every table. It is immutable.
- Tables listing `updated_at` use timestamptz NOT NULL DEFAULT now(); every update
  sets it explicitly in the same statement/transaction. No implicit ORM hooks.
- All foreign-key actions are listed below. Foreign keys do not automatically
  create indexes; add the specified reverse lookup indexes.
- Text enum values use CHECK constraints, not PostgreSQL enum types, to keep
  migrations straightforward. App validation additionally enforces Unicode code
  point limits, trimming and current-date age checks.
- Timestamps are serialized to UTC ISO 8601; dates stay YYYY-MM-DD without timezone
  conversion. UUIDs serialize as strings. Do not return `SELECT *` rows as API data.

## users

Account identity and credentials. Never store plaintext passwords or opaque tokens.

| Column | Type / default | Constraint / purpose |
| --- | --- | --- |
| id | uuid | Primary key |
| email | varchar(254) | Canonical trimmed lowercase; UNIQUE |
| pending_email | varchar(254) nullable | Canonical trimmed lowercase, different from active email; not reserved |
| email_change_token_hash | char(64) nullable | SHA-256 hex digest; UNIQUE when present |
| email_change_token_expires_at | timestamptz nullable | 24-hour expiry paired with pending address and digest |
| username | varchar(30) | Canonical lowercase; UNIQUE; regex `^[a-z][a-z0-9_]{2,29}$` |
| first_name, last_name | varchar(50) | Nonblank names |
| password_hash | text | Argon2id encoded hash including salt/parameters |
| email_verified_at | timestamptz nullable | Null until verified |
| verification_token_hash | char(64) nullable | SHA-256 hex digest, UNIQUE when present |
| verification_token_expires_at | timestamptz nullable | Paired with verification digest |
| reset_token_hash | char(64) nullable | Separate SHA-256 hex digest, UNIQUE when present |
| reset_token_expires_at | timestamptz nullable | Paired with reset digest |
| token_version | integer DEFAULT 0 | CHECK >=0; increment on logout/password reset/verified email change |
| last_seen | timestamptz nullable | Last final socket disconnect, null if never online |
| created_at, updated_at | timestamptz | Global timestamp rules |

CHECK email equals lower(trim(email)); username equals lower(trim(username));
each token digest and its expiry must both be null or both non-null. Digests must
match 64 lowercase hexadecimal characters. Reject reserved usernames in the app
and a CHECK (`me`, `search`, `suggestions`, `auth`, `api`). No JWT is stored.
Unique B-tree indexes on email/username support auth lookups. Digest unique indexes
support one-use token lookup. No persistent is_online flag: derive from live sockets.

Email-change consistency CHECK: pending_email, email_change_token_hash and
email_change_token_expires_at are either all null or all non-null. A present pending
email equals lower(trim(pending_email)), is nonblank and differs from email; its
digest is exactly 64 lowercase hex characters. The unique non-null digest index
supports lookup. Do not make pending_email unique or treat it as a reservation:
the existing unique active email constraint resolves concurrent claims at verification.
Check availability both when requesting and when verifying; a conflict never
overwrites the active address. Atomically promote the pending email, clear pending
and old verification/reset fields, update verified/updated timestamps and increment
token_version. Password reset clears pending email-change fields as well. See the
auth strategy for row locking, expiry and conflict cleanup. No plaintext token storage.

## profiles

One-to-one editable dating profile; automatically created with each account.

| Column | Type / default | Constraint / purpose |
| --- | --- | --- |
| user_id | uuid | Primary key and FK users(id) ON DELETE CASCADE |
| date_of_birth | date nullable | Valid calendar date; app validates current age 18..120 |
| gender | varchar(16) nullable | CHECK man/woman/non_binary |
| sexual_preference | varchar(16) NOT NULL DEFAULT 'everyone' | CHECK men/women/everyone; unspecified orientation uses everyone |
| bio | varchar(1000) DEFAULT '' | Plain text; empty until completed |
| city | varchar(100) nullable | Nonblank when located |
| neighborhood | varchar(100) nullable | Optional, nonblank when present |
| latitude | double precision nullable | CHECK -90..90, finite |
| longitude | double precision nullable | CHECK -180..180, finite |
| location_mode | varchar(6) nullable | CHECK gps/manual |
| created_at, updated_at | timestamptz | Global timestamp rules |

Location CHECK: city/latitude/longitude/location_mode are either all null or all
non-null; neighborhood may be set only with a full location. Explicitly reject
NaN/infinities. Age, profileComplete and fameRating are derived, not stored:
age from birth date; completion per API rules; fame = min(100, incoming like count).
Do not add stale caches during Phase 1. Exact coordinates are owner-only.

Omitting sexual_preference at creation uses everyone, including seed/import data;
never persist null or require explicit orientation selection for completeness.
Any future migration from nullable data backfills nulls to everyone before adding
NOT NULL. Gender can remain null until supplied. Matching treats the default exactly
like an explicitly selected everyone preference.

GPS coordinates originate from consented browser geolocation. Manual location
originates from city and optional neighborhood text/selection, never coordinate
entry. The backend location service geocodes that text to an approximate locality
centroid before writing latitude/longitude with location_mode=manual. Failure or
ambiguity leaves the previous row unchanged. Stored manual coordinates are approximate,
not purported GPS precision; public DTOs continue to omit coordinates in either mode.

Indexes: (date_of_birth, user_id), (gender, sexual_preference, user_id),
(latitude, longitude), and (city, neighborhood). Initial distance filtering uses
a coordinate bounding box followed by exact spherical distance; B-tree indexes are
only prefilter aids, not a claimed nearest-neighbor index. No PostGIS dependency is
required for the initial 500-profile dataset. Analyze query plans before scaling.

## pictures

| Column | Type / default | Constraint / purpose |
| --- | --- | --- |
| id | uuid | Primary key |
| user_id | uuid | FK users(id) ON DELETE CASCADE |
| storage_key | text | UNIQUE randomized relative key, never original filename |
| mime_type | varchar(20) | CHECK image/jpeg, image/png or image/webp |
| size_bytes | integer | CHECK >0 and <=5242880 |
| width, height | integer | CHECK >0; product cast to bigint <=20000000 |
| position | smallint | CHECK 1..5; UNIQUE (user_id, position) |
| is_main | boolean DEFAULT false | Partial UNIQUE (user_id) WHERE is_main |
| created_at, updated_at | timestamptz | Global timestamp rules |

Unique slots plus range enforce at most five rows per user. Backend also validates
the limit with a parent-user row lock in the upload transaction. The partial unique
index enforces at most one main; backend transactions enforce at least one whenever
any pictures exist, including delete/promote and set-main. Existing rows are locked
when reordering. Deleting DB rows also requires storage cleanup after commit (FK
cascades cannot delete files). Keep a cleanup/retry path for orphaned files. Picture
URLs point to authenticated picture reads and are never stored in the database.

## tags

| Column | Type / default | Constraint / purpose |
| --- | --- | --- |
| id | uuid | Primary key |
| name | varchar(30) | Canonical lowercase trimmed name, UNIQUE; 1..30 characters |
| created_at, updated_at | timestamptz | Global timestamp rules |

Reusable catalog populated by migration/seed, not user-created duplicates. Unique
name index supports lookup. Names are plain text; UI may display a # prefix.

## user_tags

| Column | Type | Constraint / purpose |
| --- | --- | --- |
| user_id | uuid | FK users(id) ON DELETE CASCADE |
| tag_id | uuid | FK tags(id) ON DELETE CASCADE |
| created_at | timestamptz | Global timestamp rules |

Composite primary key (user_id, tag_id) prevents duplicate associations. Reverse
index (tag_id, user_id) supports discovery. Backend enforces <=10 per user under
parent-row lock when replacing the set. No updated_at needed for immutable pairs.

## likes

| Column | Type | Constraint / purpose |
| --- | --- | --- |
| id | uuid | Primary key |
| liker_id | uuid | FK users(id) ON DELETE CASCADE |
| liked_id | uuid | FK users(id) ON DELETE CASCADE |
| created_at | timestamptz | Global timestamp rules |

UNIQUE (liker_id, liked_id); CHECK liker_id <> liked_id. Duplicate likes cannot
exist. Index (liked_id, created_at DESC, id DESC) supports incoming likes and fame.
The unique index supports outgoing and reciprocal lookup. Connections derive from
two opposite likes, no connections table; connectedAt is max of their timestamps.

## profile_views

| Column | Type | Constraint / purpose |
| --- | --- | --- |
| id | uuid | Primary key |
| viewer_id | uuid | FK users(id) ON DELETE CASCADE |
| viewed_id | uuid | FK users(id) ON DELETE CASCADE |
| created_at | timestamptz | Returned as viewedAt |

CHECK viewer_id <> viewed_id. Repeated visits are separate immutable records, not
unique pairs. Indexes (viewed_id, created_at DESC, id DESC) and (viewer_id).

## blocks

| Column | Type | Constraint / purpose |
| --- | --- | --- |
| id | uuid | Primary key |
| blocker_id | uuid | FK users(id) ON DELETE CASCADE |
| blocked_id | uuid | FK users(id) ON DELETE CASCADE |
| created_at | timestamptz | Global timestamp rules |

UNIQUE (blocker_id, blocked_id); CHECK blocker_id <> blocked_id. Duplicate blocks
cannot exist. Index (blocked_id, blocker_id) supports reverse-direction checks.
Blocking deletes both likes in the same transaction; unblocking never restores them.

## reports

| Column | Type / default | Constraint / purpose |
| --- | --- | --- |
| id | uuid | Primary key |
| reporter_id | uuid | FK users(id) ON DELETE CASCADE |
| reported_id | uuid | FK users(id) ON DELETE CASCADE |
| reason | varchar(16) | CHECK spam/harassment/fake_account/other |
| details | varchar(2000) | Trimmed nonblank |
| status | varchar(16) DEFAULT 'pending' | CHECK pending/reviewed/dismissed; internal only |
| created_at, updated_at | timestamptz | Global timestamp rules |

CHECK reporter_id <> reported_id. Multiple reports are allowed; no pair uniqueness.
Indexes (reported_id, created_at DESC), (reporter_id), (status, created_at).
There is no moderation UI/API in the initial public contract. Reports never block
automatically; access is limited to the reporting user and future authorized review.

## messages

| Column | Type | Constraint / purpose |
| --- | --- | --- |
| id | uuid | Primary key |
| sender_id | uuid | FK users(id) ON DELETE CASCADE |
| receiver_id | uuid | FK users(id) ON DELETE CASCADE |
| client_message_id | uuid | Client-generated idempotency key |
| content | varchar(2000) | CHECK trimmed length 1..2000; plain text |
| created_at | timestamptz | Global timestamp rules |

CHECK sender_id <> receiver_id; UNIQUE (sender_id, client_message_id). Messages are
immutable; no edit/delete/read-receipt endpoints or updated_at field. Indexes
(sender_id, receiver_id, created_at DESC, id DESC) and
(receiver_id, sender_id, created_at DESC, id DESC) support both directions and FKs.
Keep rows after unlike/block but deny access unless currently connected and unblocked.
Delete cascades apply only to account deletion. No conversation table is needed.

## notifications

| Column | Type / default | Constraint / purpose |
| --- | --- | --- |
| id | uuid | Primary key |
| recipient_id | uuid | FK users(id) ON DELETE CASCADE |
| actor_id | uuid nullable | FK users(id) ON DELETE SET NULL |
| type | varchar(16) | CHECK LIKE/PROFILE_VIEW/MESSAGE/CONNECTION/UNLIKE |
| message_id | uuid nullable | FK messages(id) ON DELETE SET NULL |
| is_read | boolean DEFAULT false | Wire field read |
| created_at, updated_at | timestamptz | Global timestamp rules |

CHECK actor_id is null or differs from recipient_id. message_id must be null for
non-MESSAGE notifications; MESSAGE normally references a message but may become
null after deletion. UNIQUE (recipient_id, type, message_id) prevents duplicate
message notifications (null references intentionally allow repeated other events).
Wire metadata is derived: `{ messageId }` only if actor and message still exist,
otherwise `{}`. actorUsername is joined from users, never copied as stale private
data. No generic unvalidated JSON metadata column is needed.

Indexes: (recipient_id, created_at DESC, id DESC), partial (recipient_id, created_at
DESC) WHERE NOT is_read, (actor_id), and (message_id). Listing and unread counting
must apply identical block visibility predicates. Read operations update updated_at.

## Cross-Table Integrity and Transactions

Use parameterized queries with `$1`, `$2`, `$3`; never concatenate user input into
SQL. SQL identifiers/order directions must come from a fixed server-side allowlist.
Application transactions enforce verified/complete profiles and current connections,
which foreign keys alone cannot enforce. Acquire both user row locks in ascending
UUID order for pair operations (like/unlike/block/send) to avoid deadlocks and races.
Check block/connection state under these locks; persist related notifications in the
same transaction and emit socket events only after commit. All operations affecting
these invariants use the same locking protocol. See [backend guide](OUSSAMA_BACKEND_GUIDE.md).

No database objects are created during Phase 0. First migrations will add these 11
business tables plus a small schema_migrations ledger (version text primary key,
checksum text, applied_at timestamptz default now()). Migration files are immutable
after merge. The seed must later generate at least 500 distinct synthetic profiles
with coherent pictures, tags, locations and relationships; never real credentials
or real personal data, and never automatic production seeding.
