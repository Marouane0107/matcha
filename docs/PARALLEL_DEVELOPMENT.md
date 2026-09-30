# Parallel Development

Phase 0 contracts are the baseline. Marouane owns frontend and realtime client;
Oussama owns backend, raw SQL and realtime server. Feature branches are short-lived,
never permanent frontend/backend branches. Review shared changes with the other
developer before merging; do not redefine DTOs privately.

The lanes below are delivery waves, not replacements for the numbered subject
milestones in [the roadmap](PROJECT_ROADMAP.md). Database work can proceed while UI
uses typed service mocks; no feature is considered integrated until tested together.

| Wave | Marouane branch and work | Oussama branch and work | Integration gate |
| --- | --- | --- | --- |
| 1a | feat/auth-ui: routing, forms, in-memory state, service mocks | feat/database-foundation: connection, migrations, error foundation | Shared imports compile; UI mocks and database tests run independently |
| 1b | Continue auth UI and error cases with typed mocks | feat/auth-api: register/login/me/logout/verification/reset | Replace mock adapter; verify complete auth lifecycle |
| 2 | feat/profile-ui: owner/public views and picture controls | feat/profile-api: profiles/tags/uploads | Privacy, main-picture and five-picture limits |
| 2b | feat/location-ui: GPS permission/manual fallback | feat/location-api: validate/save location | Coordinate privacy, denied GPS and manual selection |
| 3 | feat/browse-ui: discovery, sorting and empty states | feat/matching-api: eligibility, distance and suggestions | Same query serialization, order and pagination |
| 4 | feat/search-ui: criteria/filter/sort controls | feat/search-api: backend filtering and search | Combined filters, no frontend bulk filtering |
| 5 | feat/likes-ui: like/unlike state and received likes | feat/likes-api: directed likes and transactional mutuality | LikeStatus matches after every mutation |
| 6 | feat/connections-ui: connection list and removal states | feat/connections-api: connection list, authorization checks | Mutual likes, unlike and connection timestamps |
| 7 | feat/safety-ui: visits, blocks and reports | feat/safety-api: visit/block/report persistence and policy | No blocked discovery/history/notifications |
| 8a | feat/socket-client: typed connection/presence lifecycle with fake adapter | feat/socket-server: handshake, rooms, expiry and presence | Socket auth, event maps and reconnect |
| 8b | feat/chat-ui: conversation/history/send states using typed services | feat/chat-api: history, chat handlers and persistence | Retry deduplication, connection loss and authorization |
| 9 | feat/notifications-ui: list/count/read states | feat/notifications-api: notification fan-out and read handlers | Event/REST consistency, multi-tab refresh and blocked actors |
| 10 | feat/responsive-testing: large datasets, accessibility/browser checks | feat/database-seed: 500+ synthetic profiles | Reproducible realistic dataset and full flows |
| 11 | Frontend security/regression fixes in small scoped branches | Backend security/regression fixes in small scoped branches | Security review, integration and defense rehearsal |

Mutation services must persist notifications in the same transaction as their
source action when that action is implemented. Wave 9 completes delivery/list/read
behavior; earlier branches may create notification rows without realtime handlers.
Similarly, likes create mutuality in Wave 5; Wave 6 completes the connection views.

## Working Without Waiting

Marouane uses the [documented mock strategy](MAROUANE_START_HERE.md), behind service
functions, never fixture imports in UI. Oussama uses API/database tests and contract
examples independently of frontend readiness. Both test success, unauthorized,
validation, not-found, conflict and network failure states appropriate to the feature.

At each gate, run install/build/typecheck, run feature tests, use real API adapters,
and verify one complete user journey. A frontend branch may merge with clearly
development-only mocks while the backend branch continues. Production adapters
must not silently fall back to mocks. Each PR states what's implemented and what's
still mocked. Scope changes require a contract PR first, not a new architecture meeting.
