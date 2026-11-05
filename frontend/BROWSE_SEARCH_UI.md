# Browse and Advanced Search

Branch: `feat/browse-search-ui`. Worktree: `/home/mar_1/matcha-browse`.
Frontend-only delivery, reviewed 2026-11-05. No commits, pushes, backend/shared
changes, new dependencies, or inclusion of pending interactions PR #7.
No official subject file was found; implementation follows the requested subject
features and the Phase 0 API contract, roadmap and parallel-development guidance.

## Review

```sh
npm run build --workspace=@matcha/shared
VITE_AUTH_MOCK=true VITE_PROFILE_MOCK=true VITE_DISCOVERY_MOCK=true npm run dev --workspace=frontend -- --port 5176 --strictPort
```

Review server: <http://127.0.0.1:5176/>. Synthetic login: `demo` /
`DemoPassword123`. Browse and Search appear in the authenticated navigation.
The editor task tool could not target this separate worktree, so the server was
started directly in a terminal; no task/config file was added to either worktree.

## Implemented

- `/browse`: suggestions with age, distance, fame and common-interest sorting.
- `/search`: advanced search using the same filter form, result cards and pages.
- Both support minimum/maximum age, maximum distance, minimum/maximum fame and
  up to ten curated tag IDs. Selected tags mean all must match, not any.
- Age validation uses integers 18..120; fame 0..100; distance >0..20000 km;
  minimums cannot exceed maximums. Empty numeric fields are omitted. There are no
  coordinate, geocoding, map or search-origin controls; saved owner location applies.
- Sort options send age/distance/fame/commonTags and asc/desc. Suggested order
  leaves sort parameters absent so the backend owns ranking. Search defaults to
  the documented distance order. Apply/Search commits draft filters; Reset clears
  them. A new filter or sort submission resets pagination to page one.
- Cards display main picture, name/age, username, approximate location, distance,
  fame, common-interest count and the returned profile tags. The contract supplies
  a common-tag count, not a list of shared tag IDs; tags are therefore labeled
  Interests, not falsely labeled shared interests.
- Existing ProfileImage loads authenticated blobs and cleans up object URLs.
  Existing public-profile routing handles profile details and unavailable/blocked
  responses. No visit side effect or Like/Block/Chat/Notification UI was added.
- Previous/Next uses returned pagination page/totalPages, without fetching all
  profiles or locally filtering/sorting real responses. Out-of-range empty pages
  retain Previous when applicable. Loading, empty, retry, unavailable, missing
  location and incomplete-profile states are supported. Retry preserves criteria.
- Async effects ignore stale responses after criteria changes, auth changes or
  unmount. Old result data is hidden while the next page/request loads.

Filters are not persisted in URLs/storage or retained after leaving/re-entering
the route. Browse and Search have independent drafts. Infinite scroll, matching,
interactions and additional discovery features are deliberately out of scope.

## Architecture and Contract

`DiscoveryPage -> DiscoveryService -> real API or explicit development adapter`.
Shared SearchQuery, ProfileSearchResult and PaginatedData are used directly.
The existing client unwraps ApiResponse, so services return PaginatedData rather
than a second envelope. Runtime checks reuse the existing public-profile guard
and validate result metrics and pagination. Private coordinate/owner payloads are
rejected rather than translated or displayed.

Real endpoints:

```text
GET /api/profiles/suggestions
GET /api/profiles/search
200 { success: true, data: { items: ProfileSearchResult[], pagination }, error: null }
```

The existing API client gained an optional URLSearchParams query option. Route
paths still reject embedded query strings, fragments and foreign origins; query
data is attached only after those checks. The adapter allowlists Phase 0 query
keys, encodes tag UUIDs as one comma-separated value and supports the contract's
optional origin encoding without adding any origin UI. Auth, timeout, cookie
omission, no-store, redirect rejection and invalidation behavior are unchanged.

## Development Scenarios

VITE_DISCOVERY_MOCK defaults false and requires Vite DEV. Production always selects
the real service, even with the flag true; there is never an API-error fallback.
Use all three mock flags above for independent backend-free review. The populated
scenario is a fixed discovery harness, independent of the demo owner's incomplete
onboarding state; it is not evidence of matching/eligibility integration.

Set VITE_DISCOVERY_SCENARIO before starting the server:

| Scenario | Behavior |
| --- | --- |
| populated (default) | 16 synthetic profiles; filters, all sort modes and pagination |
| empty | Empty page with contract pagination metadata |
| incomplete | 422 PROFILE_INCOMPLETE with profile/location recovery links |
| location | 422 LOCATION_REQUIRED with profile/location recovery links |
| network | TransportError network and retry |
| api | 500 INTERNAL_ERROR and retry |

Sorting/filtering of fixtures occurs only inside the development service, not in
the UI/real adapter. Distances, fame and common-tag counts are synthetic fixture
metrics, not client recommendations. UUID picture metadata points to synthetic PNG
silhouettes served by the profile mock; no real people's photos/data are bundled.
Fixture public pages use browse_demo_1 through browse_demo_16 and the existing
profile service/presentation. All fixture modules are development-only imports.

## Real Backend Integration Gaps

Source inspection of the merged backend (not a live database test):

- Both canonical routes exist in routes/browse.routes.js and are mounted at
  `/api/profiles`. Controllers use the standard envelope helper, but data contains
  `profiles` plus metadata rather than `items` with ProfileSearchResult DTOs.
- browse.controller.js returns raw snake_case database rows, including exact
  latitude/longitude and birth_date. Those fields must be removed server-side.
  Results need canonical public fields, pictures, presence/relationship values,
  numeric distanceKm/commonTags and approximate PublicLocation.
- Controller reads sort/order rather than sortBy/sortOrder. Tags are names with
  ANY matching, instead of existing UUIDs requiring all selected tags. Suggestions
  ignores maxFame. Invalid inputs are permissively parsed/clamped, not rejected
  with the documented 422 validation contract. Search-origin override is ignored.
- Eligibility uses legacy male/female/other and heterosexual/homosexual/bisexual
  values rather than shared enums/default everyone. Verified/completed target
  requirements and actor completeness are not fully enforced. Missing location
  uses 400 VALIDATION_ERROR in suggestions; search can skip distance filtering
  instead of returning LOCATION_REQUIRED. Default suggestion tie ranking differs.
- Distance is rounded to two decimals rather than nearest kilometer; PostgreSQL
  numeric expressions may also need explicit numeric conversion in the DTO layer.
- Public username GET and authenticated picture GET are absent from the merged
  route registration. Tags are nested as data.tags rather than the required Tag[].

The real frontend intentionally rejects incompatible payloads. Backend must align
before live integration; this branch contains no compatibility hacks or backend
fixes. No backend environment was started and PR #7 was not inspected or merged.

## Verification

Required gates:

```sh
npm run build --workspace=@matcha/shared
npm run typecheck --workspace=@matcha/frontend
npm run build --workspace=@matcha/frontend
npm test --workspace=frontend
git diff --check
```

Shared build, frontend typecheck/build and all 57 tests pass: 45 existing plus 12
discovery tests. Focused coverage includes canonical serialization/transport,
filter validation, all sort keys, pagination, loading/rendering, empty/error/
incomplete states, existing public-profile navigation, unavailable profiles,
privacy guards, legacy backend rejection, stale results and production mock
isolation. Production was built with all three mock flags true; fixture markers
were absent from the Vite bundle as well as the focused production compilation.

Integrated Chrome-based browser checks passed for Browse pagination, public
navigation, invalid ranges, advanced sorting/search, empty/reset, keyboard tag
selection and authenticated blob image rendering. Both routes were checked at
320/375/768/1024/1440px with no horizontal overflow. Public cards omit email, birth
date and exact coordinates; browser localStorage/sessionStorage stayed empty.
Desktop/mobile screenshots were captured during review. Labels, error associations,
native keyboard controls, visible focus, status/alert feedback and pagination
navigation semantics reuse the existing UI. No full accessibility audit claimed.
Firefox was not tested in this pass; prior host-library restrictions remain a
known environment limitation. No Firefox success is claimed.

## File Inventory

Created:

- src/features/discovery/service.ts: interface, serialization and real adapters.
- src/features/discovery/validation.ts: filter validation and sort labels.
- src/features/discovery/mock.ts: explicit scenarios and paginated fixture adapter.
- src/features/discovery/fixtures.ts: synthetic public profiles and PNG fixture.
- src/features/discovery/DiscoveryProvider.tsx: service composition/context.
- src/pages/DiscoveryPage.tsx: shared Browse/Search filters, cards and states.
- tests/discovery.test.mjs and BROWSE_SEARCH_UI.md.

Modified:

- src/services/api/client.ts: structured query option; original restrictions kept.
- src/features/profile/mock.ts: public/image fixture integration only.
- src/main.tsx: discovery adapter/provider composition.
- src/App.tsx: authenticated Browse/Search routes.
- src/layouts/AppLayout.tsx: Browse/Search navigation.
- src/styles/profile.css: shared responsive filters/results and wrapping navigation.
- .env.example: explicit discovery mock flag and scenario.

All inventory paths are relative to frontend. No backend, shared or package
manifest modifications were authored; no additional dependencies installed for
this feature. An independent package-lock.json change appeared during review
(body-parser and related dependency placement/version updates). It was left
untouched and should be reviewed separately from the frontend feature.

Suggested commit: `feat: add contract-aligned browse and advanced search UI`

Suggested PR description:

```text
## Summary
- Add Browse and Advanced Search with shared filters/cards, sorting and pagination.
- Reuse authenticated pictures and public profiles; preserve private-data boundaries.
- Add explicit typed development scenarios; keep matching/filtering on the backend.

## Verification
- Shared build and frontend typecheck/build pass; 57 tests pass.
- Chrome-based browser checks at 320/375/768/1024/1440px.
- Production fixtures excluded even with mock flags true; git diff --check passes.

## Integration
- Merged backend routes exist but query keys and DTOs still differ from Phase 0.
- Raw location/birth-date fields must be removed from backend discovery output.
- Public-profile and authenticated picture reads need backend integration.
- PR #7 and social interactions are not included; Firefox/live backend not claimed.
```
