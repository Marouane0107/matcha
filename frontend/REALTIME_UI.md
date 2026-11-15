# Chat and Realtime Notifications

Frontend implementation on `feat/realtime-ui`. No commits or pushes were made.
Scope is the mandatory chat/notification flow defined by the unchanged Phase 0
contracts in `docs/API_CONTRACT.md`, `docs/SOCKET_EVENTS.md`, shared types and the
project roadmap. No separate subject PDF was available in this worktree.

## Implemented

- Protected conversation list and direct conversation routes, available from
  mutual connection rows and public profile actions.
- Paginated history, oldest-to-newest rendering, trimmed plain-text messages of
  1 to 2000 Unicode code points, and Socket.IO sending only.
- Duplicate suppression by message ID and sender/client-message identity. An
  uncertain send retains its original payload and UUID for explicit retry.
  Recovered history can confirm an uncertain send without another send.
- Connection status, presence, disconnect/send feedback, manual reconnect and
  REST resynchronization after reconnect/focus. No automatic message replay.
- History and sending are denied after connection removal, unlike or block;
  reconnect/relationship changes revalidate history against REST. A local block
  cannot be overridden by a delayed connection event.
- Notification history and pagination for LIKE, PROFILE_VIEW, MESSAGE,
  CONNECTION and UNLIKE, realtime delivery, unread navigation count, individual
  read and read-all actions. Counts remain server-authoritative, including
  concurrent notifications during read-all. Deleted actors have no target link.
- Token-scoped state, logout/auth-error disposal, pending-send cancellation and
  named listener cleanup, including React StrictMode. Tokens stay in memory,
  REST Bearer headers and socket handshake auth, never URLs or browser storage.

No typing indicators, read receipts, message media/edit/delete, sounds, browser
push, extra socket events or other optional chat features were added.

## Contracts and Configuration

REST uses the existing authenticated client and shared DTOs: GET conversations,
GET conversation messages, GET notifications, GET unread-count, PATCH individual
read and PATCH read-all. Pagination is structured `page`/`limit` query data.
No REST send endpoint is invented.

The default namespace and `/socket.io` path use
`auth: { accessToken }`, with credentials disabled. Client events are `chat:send`
and `user:online`, with ten-second acknowledgement timeouts. Server listeners are
`chat:message`, `notification:new`, `connection:new`, `connection:removed` and
`user:status`. Notification reads use the canonical REST actions, not an invented
event. Invalid payloads/acknowledgements are rejected. Authentication errors
invalidate only the matching in-memory session.

Real mode uses `VITE_API_URL` (default `http://localhost:3000/api`) and
`VITE_SOCKET_URL` (default `http://localhost:3000`, origin only, without `/api`).
There is no fallback to fixtures when a real request fails.

For the isolated synthetic review:

```sh
VITE_AUTH_MOCK=true VITE_PROFILE_MOCK=true VITE_DISCOVERY_MOCK=true VITE_INTERACTIONS_MOCK=true VITE_REALTIME_MOCK=true npm run dev --workspace=frontend -- --port 5179 --strictPort
```

Sign in as `demo` / `DemoPassword123`. The Noor fixture is initially a mutual
connection. `VITE_REALTIME_SCENARIO` accepts `populated`, `empty`, `network`, `api`,
`unauthorized`, `blocked`, `disconnected` and `timeout`. The timeout scenario
persists/delivers the first message but times out its acknowledgement; retry uses
the same identity. Fixtures share existing profile/interaction adapters, enforce
mutual connection/block rules and simulate replies/notifications. They are not a
real multi-user server or durable storage. Realtime fixtures require DEV and the
explicit realtime, profile and interactions flags. Production eliminates them
even when those flags are set.

## File Inventory

New files:

- `src/features/realtime/service.ts`: guarded canonical REST adapter, validation
  and chronological message merge.
- `src/features/realtime/channel.ts`: typed Socket.IO lifecycle and acknowledgements.
- `src/features/realtime/RealtimeProvider.tsx`: session-scoped orchestration,
  refresh, read actions, connection restrictions and adapter selection.
- `src/features/realtime/mock.ts`: explicit development-only fixtures/scenarios.
- `src/pages/ChatPage.tsx`: conversation/history/composer UI.
- `src/pages/NotificationsPage.tsx`: notification history/read UI.
- `src/styles/realtime.css`: responsive styles matching the existing app.
- `tests/realtime.test.mjs`: 19 focused transport, rendered UI, lifecycle,
  restrictions, retry, pagination and production-isolation tests.
- `REALTIME_UI.md`: this handoff.

Changed existing files:

- `src/main.tsx`: initialize and mount the shared realtime bundle/provider.
- `src/App.tsx`: protected messages and notifications routes.
- `src/layouts/AppLayout.tsx`: Messages/Notifications navigation and unread count.
- `src/features/interactions/ProfileActions.tsx` and
  `src/pages/RelationshipsPage.tsx`: mutual-connection message links.
- `src/features/auth/utils/errors.ts`: existing shared chat-error labels.
- `.env.example`: explicit realtime mock/scenario configuration.

No backend, shared contract, schema, dependency manifest or existing test file
was changed. The independently modified root lockfile was preserved byte-for-byte
(SHA256 `9bbda36006d48ab5a1cb261add9276110f6f9a5115fd8b2bee96658a76a6025d`).

## Verification

Completed on 2026-11-15:

- `npm run build --workspace=@matcha/shared`: passed.
- `npm run typecheck --workspace=@matcha/frontend`: passed.
- Frontend production build with all mock flags true: passed; generated JS
  contains none of the realtime/auth/discovery/interaction fixture markers.
- `npm test --workspace=frontend`: 93 passed, 0 failed; all 74 pre-existing tests
  remain passing, plus 19 new realtime tests.
- `git diff --check`: passed.
- Integrated Chromium review: connection-to-chat navigation, send/reply without
  duplicates, unread delivery, read-all, unlike denial, re-like restoration,
  logout and empty local/session storage passed. Keyboard Tab reaches Send and
  Enter submits. Desktop/mobile screenshots were reviewed.
- Chat and notifications at 320, 375, 768, 1024 and 1440 pixels: no horizontal
  document overflow or offscreen main controls. A 200-character unbroken message
  also wraps without overflow.

Firefox and Safari were not verified. Automated tests cover failure scenarios,
pagination, read failures, connection removal, local block precedence, restored
connections, stale session cleanup and retry recovery; those scenarios were not
all manually exercised in a browser.

## Backend Compatibility and Remaining Work

The real frontend adapter follows the shared contracts, but live backend
compatibility is **blocked**, not verified. The current `backend/src/server.js`
mounts auth/profile/discovery/interaction/tag routers, but no conversations or
notifications routers. Its Socket.IO connection handler only logs connect and
disconnect: no handshake auth middleware, `chat:send`/`user:online` handlers or
documented realtime deliveries are present. The public-profile route also uses
an ID parameter rather than the canonical username lookup required by existing
frontend profile links.

Backend owners must implement the existing contracts, authorization (including
current mutual connections and blocks), durable idempotent message persistence,
notification counts/read actions and authenticated socket lifecycle. Then run a
real two-user integration review, including reconnect, revocation, offline
notifications and duplicate delivery. No backend workaround, contract change or
mock fallback was introduced here. No mandatory frontend flow is intentionally
deferred; live integration and cross-browser verification remain open.

## Suggested Commit and PR

Suggested commit: `feat(frontend): add mandatory chat and realtime notifications`

Suggested PR title: `Complete mandatory Chat and Realtime Notifications frontend`

PR summary:

- Add contract-aligned paginated chat and notifications with authenticated socket
  lifecycle, explicit same-identity retries and server-authoritative unread state.
- Integrate mutual-connection message actions, immediate access revocation,
  reconnect resynchronization and logout cleanup without changing existing flows.
- Add development-only fixtures and 19 regressions; all 93 frontend tests and
  required builds pass. Responsive Chromium review completed.
- Backend/shared/schema unchanged. Live integration awaits the existing backend
  contracts; exclude the pre-existing independent lockfile change from this PR.
