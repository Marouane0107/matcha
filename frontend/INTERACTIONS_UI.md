# Profile Interactions

Reviewed 2026-11-05. Branch: `feat/interactions-ui`.
Worktree: `/home/mar_1/matcha-interactions`. No commit or push performed.
No backend, shared, database, package or lockfile changes; no dependencies added.
Pending PR #7 was not fetched, inspected, modified or merged.

## Baseline and Scope

The requested worktree starts at main 307fd77. It contains Auth, Profile and
Location UI and 45 tests, but no Browse/Search frontend or its 12 tests. Those
features/tests were not removed or rewritten; they are absent from this baseline.
The earlier Browse/Search branch was not pulled into this task. All 45 available
tests remain intact. Merge coordination for those branches is still needed.

No official subject PDF/file was found in this worktree. Implementation follows
the requested school-project features and Phase 0 API/Socket contracts. There is
no Chat, Notifications, socket client, moderation dashboard or optional social UI.

## Review Setup

```sh
npm run build --workspace=@matcha/shared
VITE_AUTH_MOCK=true VITE_PROFILE_MOCK=true VITE_INTERACTIONS_MOCK=true npm run dev --workspace=frontend -- --port 5177 --strictPort
```

Review server: <http://127.0.0.1:5177/>. Synthetic login: `demo` /
`DemoPassword123`. Use Likes received, Visitors or Connections to open fixture
profiles. The terminal server runs in this separate worktree; no workspace task
was added outside the editor's active workspace.

VITE_INTERACTIONS_MOCK defaults false. The mock bundle requires Vite DEV plus
both VITE_INTERACTIONS_MOCK=true and VITE_PROFILE_MOCK=true, so it cannot quietly
replace real profile reads. Auth mock selection stays independent. Production
always uses real adapters; API failures never cause fallback to fixtures.

## Implemented Features

### Likes and Connections

Public profiles offer Like/Unlike unless self, locally blocked or unavailable.
The existing profile presentation displays likedByMe, hasLikedMe and isConnected.
Successful mutations replace these values with the backend LikeStatus, not a
frontend eligibility calculation or optimistic mutuality guess. Synchronous locks
prevent duplicate submits; all action controls disable while a mutation runs.
PROFILE_PICTURE_REQUIRED and PROFILE_INCOMPLETE errors link back to owner/profile
photo completion. Stale-like/unavailable errors offer profile refresh. Refresh
hides the old payload immediately, and late mutation completions cannot overwrite
another profile. Server eligibility and access control remain authoritative.

### Visits

After a successful non-self public-profile load, an explicit POST records a visit.
GET profile is never treated as the visit mutation. A navigation-key/token/target
cache held by the public page deduplicates StrictMode effects, relationship
rerenders and profile refetches. New profile-opening navigation entries can record
new visits. No visit occurs for masked/failed reads or self.

Failed visit outcomes are shown separately without hiding the profile and are not
automatically retried: an uncertain network outcome might already be persisted.
The cache is memory-only and ends when the public-page instance unmounts. This is
client-side accidental-duplicate protection, not a claim of backend idempotency.
Incoming visitor history is read separately from the owner's outgoing visit action.

### Blocking and Reporting

Block requires confirmation. Successful block immediately hides profile details,
removes visible relationship state and stores only a session-scoped identity for
Unblock. Connections contains a small "Blocked in this session" shortcut so a user
can return to an Unblock control after navigating away. Unblock refetches the
public profile and does not restore likes/connections. The UI does not infer or
announce that the other user blocked the actor.

Fake-profile reporting uses exactly ReportRequest {reason: fake_account, details}.
Details are trimmed and must contain 1..2000 Unicode codepoints. Confirmation is a
simple inline form with Cancel/Send, errors and success feedback. Reporting does
not automatically block or change relationships. Reporting remains available on
a locally blocked profile. Masked-profile safety controls work when a canonical
target ID is available from relationship-link state, without enabling likes.

Contract limitations: there is no GET blocked-users route or blocked flag in
PublicProfile. The session shortcut is not a persistent server block list and is
lost on reload, like memory-only auth. An unavailable username opened directly
without a known user ID cannot be resolved to a Block/Report endpoint; no lookup
endpoint, user-ID input or privacy-revealing fallback was invented. Backend must
still enforce block/unblock/report permissions in either-direction block states.

### Relationship Views

| Route | Contents |
| --- | --- |
| `/interactions/likes` | Users who liked the owner, with createdAt |
| `/interactions/views` | Incoming profile visits, with viewedAt |
| `/interactions/connections` | Current mutual connections, with connectedAt |

One shared list page renders returned public profiles, approximate place, date,
existing ProfileImage when present and links to existing public-profile routing.
Lists use contract pagination (page/limit; requested limit 20), loading, empty,
error/retry and Previous/Next. Returned page/totalPages control navigation. Lists
reload on entry and local mutation revisions; there is no client-side bulk fetch,
backend sorting replacement, analytics or realtime synchronization. The unavailable
Browse card abstraction could not be reused because it is not in this baseline.

Exact coordinates, email, birth date and tokens are not rendered or persisted.
Nested public-profile guards reject private list payloads. Authenticated picture
loading and blob URL cleanup continue through the existing profile component.

## Typed Services and Contract Compliance

UI -> InteractionService -> canonical authenticated API client or DEV mock bundle.
The interface uses LikeStatus, Like, ProfileView, Connection, Block, ReportRequest,
Report, Acknowledgement and PaginatedData from @matcha/shared without copied DTOs.
The existing client unwraps the standard envelope and validates response data.

| Operation | Canonical request | Success |
| --- | --- | --- |
| Like | POST `/api/profiles/:userId/like`, no body | 201 LikeStatus |
| Unlike | DELETE same route | 200 LikeStatus |
| Visit | POST `/api/profiles/:userId/view`, no body | 201 Acknowledgement |
| Block | POST `/api/profiles/:userId/block`, no body | 201 Block or idempotent 200 Block |
| Unblock | DELETE same route | 204, no JSON parsing |
| Report | POST `/api/profiles/:userId/report`, ReportRequest | 201 Report |
| Likes received | GET `/api/interactions/likes-received` | 200 PaginatedData of Like |
| Visitors | GET `/api/interactions/views` | 200 PaginatedData of ProfileView |
| Connections | GET `/api/interactions/connections` | 200 PaginatedData of Connection |

The existing API client gained structured URLSearchParams for pagination and
allowed-success-status arrays for block's documented 200/201 responses. Embedded
query/hash paths, foreign origins and redirects remain rejected; cookies remain
omitted, requests no-store and bearer tokens memory-only. Auth behavior was not
rewritten. Existing client tests remain passing.

Socket contracts were reviewed: connection:new and connection:removed exist, but
this batch deliberately uses REST refreshes and adds no Socket.IO implementation.
External changes become visible when a page is reopened or explicitly refreshed;
live delivery belongs to the later realtime batch.

## Mock Scenarios

The existing profile adapter is composed with a development interaction wrapper,
not replaced by unrelated auth/global-profile state. Three synthetic fixtures:

- sam_demo: incoming like; liking makes a mutual connection.
- noor_demo: existing mutual connection.
- robin_demo: no initial likes; liking stays one-way.

Fixture relationship changes persist in adapter memory across profile reads and
lists. Block removes both likes, connection and list visibility; unblock restores
access only. Reports do not mutate block/like state. Incoming visitors are fixed
synthetic records, not invented copies of outgoing visit requests. No real user
data, messages or notifications are present. Full reload resets fixture state.

Set VITE_INTERACTIONS_SCENARIO before starting the server:

| Scenario | Behavior |
| --- | --- |
| eligible (default) | Independent interaction harness with the states above |
| incomplete | Like returns 422 PROFILE_INCOMPLETE |
| no_picture | Like returns 422 PROFILE_PICTURE_REQUIRED |
| blocked | sam_demo is masked; like fails USER_BLOCKED; block/report remain permitted by ID |
| empty | Empty relationship lists |
| network | Transport network failure |
| api | 500 INTERNAL_ERROR |

Eligible is explicitly an interaction test harness, not a claim that the original
demo owner's incomplete onboarding profile passes real server eligibility. Use
the failure scenarios to review those errors; real server rules are not bypassed.
No frontend matching, eligibility or backend security system was implemented.

## Backend Integration Status

Source inspection of the merged main only, without a running backend/database:

- server.js mounts auth, owner profile, browse and tags routers. There is no
  interactions router, Like/Unlike/View/Block/Report registration or relationship
  list registration on this baseline. All nine interaction operations need live
  integration against Oussama's eventual implementation.
- The merged profile routes still do not expose public username GET or protected
  picture GET. Real profile/action journeys are also blocked by those existing
  integration gaps. No compatibility translation or backend modification added.
- Backend must match Phase 0 envelopes/statuses, viewer-relative LikeStatus,
  public projections, pagination and block filtering, plus atomic like/connection
  removal on block and non-restoration on unblock. Visit side effects must remain
  on the explicit POST, not GET. Server notification/socket side effects remain
  backend responsibilities, not simulated frontend delivery.

PR #7 was not inspected, so no claims are made about whether it fixes these gaps.
No live API compatibility or real concurrency/security enforcement is claimed.

## Verification

```sh
npm run build --workspace=@matcha/shared
npm run typecheck --workspace=@matcha/frontend
npm run build --workspace=@matcha/frontend
npm test --workspace=frontend
git diff --check
```

61 tests pass: all 45 tests present on this baseline plus 16 interaction tests.
Coverage: real methods/body/statuses/pagination, like/unlike/mutual transitions,
duplicate actions, self/eligibility errors, block/unblock cleanup, report validation
and non-blocking semantics, masked targets, private-data rejection, list navigation/
pagination/error/empty states, StrictMode visit dedupe, failed-visit non-retry,
late mutation cleanup and production mock isolation. Shared build, frontend
typecheck/build and git diff --check pass. The 12 Browse/Search tests from the
other branch were not available to run here; no assertion of preserving 57
baseline tests is made.

Production was built with auth/profile/interactions mock flags all true, and
fixture markers were absent. Compile-time DEV selection prevents activation;
there is no production fallback.

Integrated Chrome-based browser: reciprocal like/unlike, report validation/send,
block cancel/confirm, hidden details after block, session Unblock shortcut,
non-restoration after unblock, all three relationship views and keyboard reporting
passed. Lists and public-profile report form checked at 320/375/768/1024/1440px:
no horizontal overflow. Browser storage remained empty and no private values were
displayed. Desktop/mobile screenshots captured during review. Existing labels,
focus indicators, native controls and alert/status feedback retained. No full
assistive-technology audit, real-device verification or Firefox success claimed.
Firefox was not tested in this pass; earlier host-library blockers remain known.

## Files

Created (frontend-relative):

- src/features/interactions/service.ts: typed real adapter and response guards.
- src/features/interactions/mock.ts: stateful development service/profile bundle.
- src/features/interactions/InteractionProvider.tsx: composition, session block shortcuts and mutation revision.
- src/features/interactions/ProfileActions.tsx: Like/Unlike, Block/Unblock and fake-profile form.
- src/features/interactions/VisitRecorder.tsx: explicit visit mutation with duplicate protection.
- src/pages/RelationshipsPage.tsx: shared likes/visits/connections list.
- tests/interactions.test.mjs and INTERACTIONS_UI.md.

Modified:

- src/pages/PublicProfilePage.tsx: controls, visits, fresh state and masked-target safety.
- src/services/api/client.ts: structured query support and documented multi-status success.
- src/main.tsx, src/App.tsx, src/layouts/AppLayout.tsx: service composition/routes/navigation.
- src/features/auth/utils/errors.ts: shared interaction-code messages only.
- src/styles/profile.css: responsive lists, actions and wrapping navigation.
- .env.example: explicit interaction mock/scenario defaults.

No existing test files were modified. No backend/shared or unrelated feature edits.

## Suggested PR

Title/commit: `feat: add profile likes, visits, safety controls and relationship lists`

```text
## Summary
- Add Like/Unlike and accurate mutual-state updates on public profiles.
- Record explicit visits without StrictMode/refetch duplicates.
- Add block/unblock and fake-profile reporting with confirmation and API feedback.
- Add paginated likes-received, visitor and connection views with typed DEV mocks.

## Verification
- Shared build and frontend typecheck/build pass; 61 tests pass; diff check passes.
- Chrome-based mobile/desktop review at 320/375/768/1024/1440px.
- Production mock exclusion verified with all mock flags true.

## Integration Notes
- Baseline has 45 tests and no Browse/Search frontend; coordinate the separate merge.
- Merged backend lacks interaction routes and public/protected-picture reads.
- PR #7, Chat, Notifications and realtime implementation are not included.
- Session-only unblock shortcut reflects the absence of a blocked-users GET contract.
```
