# Defense Rehearsal Division

How the two developers split the evaluation defense. Each section lists the topics
that speaker owns and can be questioned on.

## Marouane — Frontend Architecture

- Routing (React Router: guest/protected layouts, nested routes, fragment-token handling).
- State management (AuthProvider / ProfileProvider / InteractionProvider, `useSyncExternalStore` auth session).
- API service layer (`services/api/client.ts` transport + per-feature typed services and strict runtime validators).
- Mock-to-real integration (`VITE_*_MOCK` flags and `select*` factories).
- Validation UX (form validation, error-code → user-facing message mapping).
- Responsive design and component structure.

## Marouane — Realtime Client

- Socket lifecycle (connect, JWT handshake auth, disconnect/reconnect).
- Event listeners and payload handling (`chat:message`, `notification:new`, `connection:new/removed`, `user:status`).
- Optimistic message sending and deduplication via `client_message_id`.
- Reconnect UI and gap recovery via REST refetch.

## Oussama — Database & Raw SQL

- Schema relationships (users/profiles/tags/photos/likes/visits/blocks/messages/notifications/tokens/reports).
- Parameterized queries only (zero interpolation); CTE-based browse/search strategy.
- Search/matching query strategies (eligibility filter, Haversine distance, allow-listed sort columns/directions).
- Indexes and unique constraints (email/username uniqueness, like/block uniqueness, message dedup index).

## Oussama — Auth & Security

- Password hashing (bcrypt) and the 12–128 char letter+number password policy.
- Verification/reset tokens (32-byte random, SHA-256 digest storage, expiry, single-use).
- JWT bearer authorization (`requireAuth`, signature/expiry/account/verified checks).
- Injection defenses (parameterized SQL, sort allow-lists) and upload defenses (MIME/extension checks + Sharp decode + size limits).
- Rate limiting, CORS restriction, and sanitized error responses.

## Oussama — Realtime Server

- Socket authentication middleware (JWT from the handshake, verified-account check).
- Room/mapping strategy (`user:<id>` rooms, in-memory presence map).
- Message persistence (transactional insert + notification, idempotent `client_message_id`).
- Notification emission (LIKE / PROFILE_VIEW / MESSAGE / CONNECTION / UNLIKE) and `connection:new/removed`.
- Presence (`user:status`, `last_seen` on final disconnect).

## Both — End-to-End Journey & Edge Cases

Walk through the full flow together and be ready to explain edge cases:

1. Registration → email verification → login → profile completion → discovery.
2. Browsing/search → profile view (PROFILE_VIEW) → like → mutual match (CONNECTION) → chat (MESSAGE) → notifications.
3. Edge cases: blocks, unlikes that break a connection, self-like prevention, rate limits, offline message delivery (persisted, fetched on reconnect), invalid/expired tokens, and upload rejection of spoofed files.
