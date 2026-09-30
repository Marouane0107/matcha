# Marouane: Start Here

Owner: Frontend & Realtime Client. Phase 0 contains no feature pages. Start the
first feature immediately against the finalized contracts; no backend wait needed.

## First Branch: feat/auth-ui

From a clean main, use the workflow in [Git workflow](GIT_WORKFLOW.md). Install
from the root and run `npm run dev` (or `npm run dev:frontend`). Shared builds first;
the combined dev command also watches shared changes. With frontend-only dev,
run `npm run build --workspace=shared` after editing shared contracts.

Implement in this order:

1. App routing for /register, /login, /verify-email, /forgot-password,
   /reset-password and protected /profile (placeholder until the next branch).
2. Auth layout and responsive accessible form primitives, loading/empty/error states.
3. Register, login, email verification, forgot-password and reset-password pages.
4. Auth API service using RegisterRequest, LoginRequest, AuthResponse and the other
   shared requests; no duplicated DTOs in frontend/src/types.
5. In-memory auth state, 401 handling, me bootstrap with an existing token, and
   route protection. Never persist bearer tokens; reload/expiry requires login.
6. Standard error display keyed by ERROR_CODES, with human-readable fallback.
7. Verification/reset fragment handling: read once, remove from history, submit by
   POST; never place tokens in analytics/logging.
8. Typed contract mocks behind services and focused component/service tests.

Use direct package imports:

```ts
import type { AuthResponse, RegisterRequest, UserProfile } from "@matcha/shared";
import { API_ROUTES, ERROR_CODES, SOCKET_EVENTS } from "@matcha/shared";
```

`frontend/src/services/api/contracts.ts` already verifies package resolution.
Services own transport; endpoint adapters belong in frontend/src/api, feature
components in frontend/src/features/auth, route-level composition in pages/layouts.
Presentational components must not call fetch or import fixture data directly.

## Mock Strategy (Documentation Only)

```text
components/pages -> typed service function -> selected real or mock adapter
```

Define a service interface with the same input/output contract for both adapters.
For example, getSuggestedProfiles(SearchQuery) will return a promise of
`PaginatedResponse<ProfileSearchResult>`. The real adapter uses API_ROUTES and the
configured origin; the mock returns the same envelope. Components only consume
the service function. Keep fixtures and mock selection in the service/composition
layer, never `import mockData` inside components.

When implementing mocks, select via Vite's existing development mode plus one
local composition setting, default to real outside development, and keep mock
code out of production imports. Do not add a second public API or mock server now.
Simulate success, validation, invalid credentials, unverified email, expired session,
network failure and loading. Use synthetic data, never genuine credentials/tokens.
Use distinct test-only opaque strings for token responses, not signed JWT secrets.

Network/timeout failures are transport errors, not fabricated backend INTERNAL_ERROR
responses. Handle them separately from ApiResponse failures. Parse 204 as no content.
For every real response, check HTTP status and envelope consistently; do not swallow
unexpected shapes. Do not locally filter all users in search/browse.

## Acceptance Gate

- Each auth route handles success and the documented failures through the service.
- Login uses username/password; register also collects email and first/last names.
- Me and logout behavior follows [Auth strategy](AUTH_STRATEGY.md), including
  all-device logout semantics and the 15-minute session without refresh tokens.
- `npm run build` and `npm run typecheck` pass; add focused tests with the feature.
- Integrate against Oussama's auth API by changing only adapter selection, not UI DTOs.

Next branch: `feat/profile-ui`, with typed fixtures for UserProfile/PublicProfile,
picture collections and location. Full sequence: [parallel map](PARALLEL_DEVELOPMENT.md).

The profile/account branch includes a change-email form using ChangeEmailRequest
and the public /verify-email-change route using VerifyEmailChangeRequest. Show the
current email until verification succeeds; on success clear local auth and request
login. INVALID_CURRENT_PASSWORD is a form error, not a session-expiry signal.
Keep username read-only. Frontend password feedback is UX; the backend also rejects
common/dictionary/compromised passwords with PASSWORD_TOO_COMMON.

Initialize sexualPreference to DEFAULT_SEXUAL_PREFERENCE (everyone), never null;
do not require users to choose an orientation before discovery. Keep fixtures aligned.
Location controls ask for GPS consent or city and optional neighborhood selection/text,
never raw latitude/longitude. GPS supplies coordinates through browser geolocation.
Manual LocationUpdateRequest sends no coordinates: the backend geocodes an approximate
centroid before saving. Show validation errors for ambiguous places and let users
refine city with region/country. Use the returned Location, not fabricated client
coordinates. Search-origin overrides may use consented GPS or a saved resolved
location; they must not introduce coordinate-entry fields.
