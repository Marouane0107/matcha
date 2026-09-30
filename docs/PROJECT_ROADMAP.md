# Project Roadmap

This is a plan, not implemented functionality. Only Phase 0 scaffolding is present;
final contract agreement and branch protection still need the team's review.

## Phase 0: Repository + Architecture + Contracts

- Marouane tasks: review frontend folders, placeholder boot and API/socket boundaries.
- Oussama tasks: review backend folders, configuration and raw SQL ownership.
- Shared integration task: approve contracts, workflow and branch protection.

## Phase 1: Database Foundation

- Marouane tasks: identify data needed by planned screens and review public fields.
- Oussama tasks: design PostgreSQL schema, constraints, migrations and connection setup.
- Shared integration task: align shared IDs/types with the schema and migration workflow.

## Phase 2: Authentication

- Marouane tasks: build signup/login, verification and password-reset screens.
- Oussama tasks: implement secure auth, hashing, verification, reset and email delivery.
- Shared integration task: verify session lifecycle, validation and error handling end to end.

## Phase 3: User Profiles

- Marouane tasks: build profile editing/display and image upload UI.
- Oussama tasks: implement profiles API, picture storage and upload security.
- Shared integration task: verify owner/public visibility and upload validation.

## Phase 4: Location

- Marouane tasks: build GPS permission, fallback and location-editing UI.
- Oussama tasks: implement location validation, persistence and distance support.
- Shared integration task: agree on precision/privacy and test denied GPS permission.

## Phase 5: Browsing and Matching

- Marouane tasks: build browsing, match results, filter and sorting UI.
- Oussama tasks: implement matching rules, browse queries and ranking.
- Shared integration task: validate result order, eligibility and pagination together.

## Phase 6: Advanced Search

- Marouane tasks: build search criteria, filters, sorting and result states.
- Oussama tasks: implement parameterized search queries, validation and pagination.
- Shared integration task: verify combined criteria, empty results and stable sorting.

## Phase 7: Likes and Connections

- Marouane tasks: build like/unlike controls and connection views.
- Oussama tasks: implement likes, mutual connections and removal semantics.
- Shared integration task: verify lifecycle, permissions and UI consistency.

## Phase 8: Profile Visits, Blocks and Reports

- Marouane tasks: build visit history, block controls and report forms.
- Oussama tasks: implement visit records, blocks, reports and privacy enforcement.
- Shared integration task: test blocked-user effects across browse, profile and messaging.

## Phase 9: Realtime Chat

- Marouane tasks: build chat UI and Socket.IO client connection/reconnection behavior.
- Oussama tasks: implement authorized Socket.IO messaging and chat persistence.
- Shared integration task: test history, delivery, duplicates, reconnect and lost connections.

## Phase 10: Realtime Notifications

- Marouane tasks: build notifications UI, unread state and realtime updates.
- Oussama tasks: implement notification persistence, dispatch and read acknowledgements.
- Shared integration task: verify recipients, unread counts and reconnect synchronization.

## Phase 11: Database Seeding with 500+ Profiles

- Marouane tasks: inspect realistic UI states, long content and large result sets.
- Oussama tasks: generate at least 500 distinct profiles with consistent related data.
- Shared integration task: reproduce a populated development environment without real personal data.

## Phase 12: Security Review

- Marouane tasks: review public env exposure, XSS risks and sensitive client state.
- Oussama tasks: review authorization, SQL injection, upload security, secrets and rate limits.
- Shared integration task: test abuse cases, blocked access and sensitive-data leaks end to end.

## Phase 13: Responsive/Browser Testing

- Marouane tasks: verify responsive layouts, accessibility and browser compatibility.
- Oussama tasks: verify API/realtime behavior under load and interrupted requests.
- Shared integration task: run cross-browser mobile/desktop user journeys and resolve regressions.

## Phase 14: Final Integration and Defense Preparation

- Marouane tasks: polish implemented workflows and prepare frontend explanations.
- Oussama tasks: verify deployment, database recovery and backend explanations.
- Shared integration task: audit the subject requirements, rehearse the demo and prepare the defense.
