# Location UI Review

Owner: Marouane. Branch: `feat/location-ui`. Reviewed 2026-11-02.
Frontend only; no commit, push, fetch or merge of pending backend PR #5.

## Run and Review

```sh
npm run build --workspace=@matcha/shared
VITE_AUTH_MOCK=true VITE_PROFILE_MOCK=true npm run dev --workspace=frontend -- --port 5175 --strictPort
```

Review server: <http://127.0.0.1:5175/>. Synthetic login: `demo` /
`DemoPassword123`. Open My profile > Add your location or Edit location.
Location editing is also linked from profile editing and the completion checklist.
The VS Code task "Review location UI (development mocks)" runs this command.

The existing ProfileProvider selects the existing profile mock only when both
Vite DEV and VITE_PROFILE_MOCK=true. No extra location flag, provider, global store,
API client, geocoding dependency or automatic production fallback was added.
Full reload resets both synthetic state and the memory-only auth session.

## User Journey

`/profile/location` is protected by the existing auth guard and authenticated shell.
The initial method is the saved location mode, or manual when no location exists.
Current city/neighborhood is shown without raw coordinates in either owner or
public UI. Public profiles continue using the shared PublicProfile projection.

### Current Location

1. Select Current location and choose "Use my current location".
2. Read the purpose/privacy explanation, then choose "Allow location request".
3. The browser requests permission and makes one getCurrentPosition call, with
   high accuracy enabled, timeout 15 seconds and maximumAge 0. No watchPosition.
4. Review the estimated accuracy and confirm city/optional neighborhood.
5. Choose "Confirm and save location" to send the GPS request.

There is no permission request on render or method selection, no continuous
tracking, and no automatic switch to manual on failure. The city fields are
necessary because the shared GPS union requires place names but browser GPS
provides coordinates only. No frontend reverse geocoder is used. The user confirms
place text; the frontend cannot independently verify it against the coordinates.

Accuracy must be finite, nonnegative and no worse than 1,000 metres. This is an
explicit UI acceptance threshold for approximate neighborhood use, not a new wire
field or a guarantee of real GPS accuracy. Coarser fixes are rejected with retry or
manual-entry guidance. Coordinate bounds are checked before saving. Permission
denied, unavailable, timeout, unsupported API, insecure context and startup failures
have distinct actionable feedback. A generation guard ignores callbacks after a
new request, method switch or unmount. Native one-shot requests cannot be canceled,
but their late callbacks have no effect.

### Manual Location

Enter a city and optionally a neighborhood. City may include region/country to
disambiguate. Both fields are trimmed, limited to 100 Unicode codepoints and reject
control characters. City is required; blank neighborhood becomes null. There are
no latitude/longitude inputs. No third-party requests or frontend geocoding occur.
The backend must resolve the approximate centroid and return it in UserProfile.

Validation/unresolved-place failures retain the previous location and invite more
specific place text. Network/internal errors use existing error notices and permit
retry. Failed requests do not mutate the mock profile.

### Save, Refresh and Navigation

The existing ProfileService was extended with updateLocation. After successful
PATCH, the page refetches `/api/profile/me` through useOwnerProfile. Success is
announced after refreshed data is available; refresh failures show the existing
retry state rather than claiming fresh data. Returning to the owner profile also
loads current backend state, including profileComplete. The frontend never assigns
discovery eligibility from its checklist. Mock completion is recomputed to simulate
the backend when location completes the last missing requirement.

Dirty text, acquired GPS or changing a saved location's mode blocks internal and
Back/Forward navigation using the established useBlocker/dialog pattern. Stay,
Discard and Escape are supported; reload/close uses native beforeunload. Switching
methods preserves typed place names but discards acquired coordinates and resets
GPS errors/consent. Inputs are disabled during saves and duplicate submission is
locked. Leaving during a save warns that the already-sent request cannot be
canceled; late completion does not update unmounted UI. Successful save removes
the old dirty form before displaying refreshed data.

Coordinates exist only in component/service memory and the authenticated request
body/owner response. They are never logged, placed in URLs, cookies, localStorage
or sessionStorage. No public-facing component prints raw coordinates.

## API Contract and Backend Compatibility

The real adapter uses the existing authenticated API client and unchanged
API_ROUTES.PROFILE.LOCATION:

```text
PATCH /api/profile/location
Authorization: Bearer <memory-only token>
GPS body:    { mode: "gps", city, neighborhood, latitude, longitude }
Manual body: { mode: "manual", city, neighborhood }
200:         { success: true, data: UserProfile, error: null }
422:         VALIDATION_ERROR (including ambiguous/unrecognized place)
500:         INTERNAL_ERROR (resolver outage)
```

The exact LocationUpdateRequest discriminated union is imported from shared. GPS
accuracy is not sent because it is not in that contract. No changes to shared
contracts, routes, schema, migrations or backend were required.

Merged backend source inspection, not live integration:

- backend/src/routes/profile.routes.js has no location route. server.js mounts
  it at `/api/profiles`, not the canonical singular `/api/profile` owner prefix.
- profile.controller.js returns latitude/longitude/locationString flat in a
  legacy object rather than Location {city, neighborhood, mode, coordinates}.
- Its response is status/data.profile rather than the standard success/data/error
  envelope and direct UserProfile. Current completion ignores location and adult
  birth date, among other Phase 0 requirements.
- There is no merged manual resolver or dedicated GPS validation/persistence flow.
  No real location endpoint exists to verify preservation on failed resolution.
- Backend must add the canonical authenticated PATCH, discriminate the two bodies,
  forbid manual coordinates, resolve manual locality server-side, atomically save
  a whole Location, recompute completion and return UserProfile. Public projections
  must continue excluding coordinates.

These are current main's implementation gaps. PR #5 was not inspected, fetched,
merged or assumed to fix them. With no local backend environment, only canonical
adapters and development fixtures were exercised. No claim of live integration.

## Development Fixtures

The existing in-memory profile mock supports:

| Input | Result |
| --- | --- |
| GPS with valid coordinates and city | Save exact supplied fix and user-confirmed place text |
| Manual Casablanca, Rabat or Paris (case-insensitive) | Save documented synthetic city centroid, retain optional neighborhood |
| Manual unknown city or `unresolved` | 422 VALIDATION_ERROR, unchanged old location |
| City `offline` | TransportError network, unchanged old location |
| City `outage` | 500 INTERNAL_ERROR, unchanged old location |
| Blank/oversized/control-character text or invalid coordinates | 422 VALIDATION_ERROR |

Manual fixture centroids are synthetic city-level stand-ins, not a geocoder and
not neighborhood-resolution evidence. Use the real backend for actual resolution.
GPS browser permission failures are tested with controllable geolocation stubs,
not fabricated real-world position acquisition. All fixtures reset on full reload.

## Verification

```sh
npm run build --workspace=@matcha/shared
npm run typecheck --workspace=@matcha/frontend
npm run build --workspace=@matcha/frontend
npm test --workspace=frontend
git diff --check
```

45 tests pass: all 32 existing tests plus 13 focused location tests. Coverage:
consent/no initial request, successful fix/confirmation, denial/unavailability/
timeout, unsupported/insecure context, accuracy, method switching, stale callbacks,
unmount during GPS/save, city/optional neighborhood/validation, save/refetch,
network/resolution/internal errors, cancel/stay/discard, real/mock body consistency,
completion update and public-coordinate privacy. Existing auth/profile regressions
remain intact. Shared build and frontend typecheck/build pass.

Production build with both mock flags enabled excludes profile/auth fixtures;
mock mode remains guarded by compile-time DEV. No dependency changes in this branch.

Integrated Chrome-based browser checks passed for manual save/refetch, public
place display without coordinates, no request before consent, GPS denial/retry,
synthetic fix confirmation/save and empty browser storage. GPS and manual screens
were checked at 320/375/768/1024/1440px: no horizontal overflow. Mobile and desktop
screenshots were captured during review. Browser keyboard method selection and
Back/Stay/Discard/Escape checks passed. Keyboard-native radios/inputs/buttons,
associated field errors, live status/alerts, focus indicators, native modal focus
and reduced-motion-aware existing styles are retained. No full assistive-technology
audit or real-device GPS accuracy certification is claimed.

Firefox launch was attempted during this pass and remains blocked by missing host
library libasound2t64. No Firefox coverage is claimed; no system packages installed.

## File Inventory

Added: features/location/LocationSelector.tsx (method selection, forms, confirmation,
save/errors/navigation guard), useGeolocation.ts (one-shot acquisition/cleanup),
validation.ts (local UX constraints); pages/LocationPage.tsx (resource/refetch);
frontend/tests/location.test.mjs; frontend/LOCATION_UI.md;
.vscode/tasks.json (workspace-root review task).

Modified: features/profile/service.ts and mock.ts (location adapters),
features/profile/validation.ts (completion link), features/profile/components.tsx
(owner location action), pages/EditProfilePage.tsx (location link), App.tsx (route),
styles/profile.css (method controls), PROFILE_UI.md (integration handoff).
Feature and page paths above are relative to frontend/src. The backend environment
example changed independently during review and was left untouched, as was the
pre-existing untracked docs/PROFILE_API_COMPATIBILITY.md.

## Suggested Commit and PR

Commit: `feat: add consent-driven GPS and manual profile location UI`

```text
## Summary
- Add protected location editor with explicit one-shot GPS consent and manual city entry.
- Extend existing profile adapters; refetch owner/completion after saving.
- Preserve coordinate privacy, navigation protection and stale callback cleanup.
- Add deterministic development scenarios and 13 location tests.

## Verification
- Shared build, frontend typecheck/build, 45 tests and git diff --check pass.
- Chrome-based review at 320/375/768/1024/1440px; production mocks excluded.
- Firefox and real backend integration are not claimed.

## Backend Follow-up
- Canonical location PATCH and manual resolver are absent from merged backend.
- Phase 0 request/response types unchanged; pending PR #5 was not included.
```
