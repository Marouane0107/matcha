# Profile UI Review

Branch: `feat/profile-ui`. No commit or push performed by the implementation agent.

## Running Without the Backend

```sh
npm run build --workspace=@matcha/shared
VITE_AUTH_MOCK=true VITE_PROFILE_MOCK=true npm run dev --workspace=frontend -- --port 5174
```

Sign in with synthetic `demo` / `DemoPassword123`. Both flags are independent and
default false. Use both for a backend-free review; enabling profile mocks alone
does not bypass real authentication. Production selects real adapters regardless
of flags and does not bundle the mock modules. No automatic error fallback exists.
The frontend dev dependencies include jsdom for rendered regression tests in the
existing Node/tsx runner; the lockfile includes that test-only dependency.

## Routes and UI

| Route | Access | Contents |
| --- | --- | --- |
| `/profile` | Authenticated | Owner profile, gallery, private details, server completion status and missing-detail checklist |
| `/profile/edit` | Authenticated | Names, adult birth date, gender, preference, bio, curated interests |
| `/profile/pictures` | Authenticated | Local preview, upload, remove confirmation and main-picture management |
| `/profiles/:username` | Authenticated | Public profile projection, approximate location, presence and relationship indicators |
| `/account` | Authenticated | Current email, password-reauthenticated pending-email request |
| `/verify-email-change#token=...` | Public | Fragment removed at boot; verification clears the existing local session on success |

The authenticated shell has header/navigation, main and footer. Future Browse,
Search, Chat and Notifications are intentionally omitted, not fake links.
The auth layout/routes remain available and visually unchanged. Owner and public
screens share presentation components but public services use only PublicProfile.
The public screen has no fake Like/Unlike/Block/Report controls or visit side effects.

## Behavior and Boundaries

- Shared DTOs/constants are imported from `@matcha/shared`; there are no copied
  wire types. ProfileService exposes the same typed operations for real and mock.
- The existing secured API client gained PATCH/DELETE, FormData and validated image
  responses. Auth headers, origin restrictions, redirect rejection, cookie omission,
  15-second timeout and 401/unverified invalidation remain. Requests use no-store.
- Pictures are requested by ID through the canonical authenticated API path, never
  raw/public storage URLs. Blob URLs are revoked on unmount/replacement; local
  upload previews are also revoked. No bearer token appears in an image URL.
- Upload UX checks MIME, nonempty file, 5 MiB, browser decoding and 20 megapixels.
  Server signature/decode/ownership checks remain authoritative. Five pictures
  maximum; mutation responses replace the complete picture collection.
- Tags come from the curated endpoint; checkboxes support at most ten selected IDs.
  PATCH replaces the complete selected set. No tag creation API exists.
- UTC calendar/age validation allows 18 through 120. Empty bio and omitted birth
  date/gender remain permitted during onboarding. Preference defaults to everyone.
- Editor uses React Router's useBlocker with createBrowserRouter/RouterProvider
  around the existing route tree. Dirty drafts block SPA Back/Forward and internal
  navigation. The modal offers Stay (also Escape) or Discard; reload/tab-close
  protection remains native beforeunload. Unchanged, reverted and successfully
  saved drafts navigate without prompting. Session invalidation is not blocked.
- Backend profileComplete controls discovery copy. The eight-item Phase 0 checklist
  explains missing data but does not override backend eligibility.
- Location is display-only. Missing location remains an honest incomplete state;
  no coordinates, GPS prompts or duplicate location service were introduced.
- Active email is not changed locally on request acknowledgement. Verification
  uses a public call without bearer, strips the fragment and clears AuthSession.
  Backend one-use enforcement and all-device revocation await API implementation.
- AuthProvider/session/guards were not rewritten. The app shell retains /auth/me
  refresh on entry and the existing logout semantics. Tokens remain memory-only.

## Synthetic Fixtures

The mock starts with Alex Demo, empty dating details/photos, preference everyone,
no location and fame zero. Edits/uploads are held only in adapter memory and reset
on full reload. Upload your own synthetic test images; there are no real personal
photos or account data in fixtures. Five-photo and main-photo rules are simulated.
The mock is a development fixture, not a substitute for server security.

- `/profiles/demo`: current fixture's public projection.
- `/profiles/sam_demo`: synthetic example with approximate Casablanca location,
  age 27, interests, online status and no photo; never a real user.
- `/profiles/offline`: network failure with retry UI.
- Other usernames: unavailable/not-found response, also used for inaccessible users.
- Email password `DemoPassword123` succeeds; other passwords yield
  INVALID_CURRENT_PASSWORD. `taken@example.invalid` produces EMAIL_ALREADY_EXISTS.
- First email-change verification token: 64 lowercase `c` characters. Subsequent
  request number N uses N in hexadecimal, left-padded with `c` to 64 characters,
  invalidating the previous fixture token. Tokens are one-use per adapter instance.
- A fresh mock accepts the first `c` fixture link independently so email-link reload
  can be reviewed. This is not a real pending request lookup, delivery, expiry
  implementation or cross-device revocation. All fixtures reset on reload.

## Verification

```sh
npm run build --workspace=@matcha/shared
npm run typecheck --workspace=@matcha/frontend
npm run build --workspace=@matcha/frontend
npm test --workspace=frontend
npm audit
git diff --check
```

32 focused tests cover existing auth/guards plus profile loading/update contracts,
UTC date and enum validation, tag limits/replacement, upload validation, five-photo
capacity, main selection/promotion, private/public separation, completion guidance,
email requests/one-use/replaced tokens, fragment removal, real adapter transport and
incompatible response rejection. Four rendered Node/tsx/jsdom tests additionally
exercise actual history.go Back/Forward with React Router, Stay/Discard/Escape,
internal links, beforeunload, unchanged/reverted drafts and successful saves.
Image lifecycle coverage verifies revocation on replacement/unmount and that late
responses allocate no blob URLs. Review also confirmed upload-preview cleanup on
replacement, cancellation and unmount; no loader changes were needed.

Chrome-based integrated browser checks: protected redirect, login, editing/save,
ten-tag limit, invalid upload type, preview/upload of five generated PNG files,
sixth-file prevention, main selection/deletion promotion, public privacy,
email-change password errors and acknowledgement without replacing active email.
Owner/edit/photos/public/account pages checked at 320, 375, 768, 1024 and 1440px:
no horizontal overflow. Pictures decoded successfully from blob URLs. Browser
localStorage/sessionStorage remained empty. Desktop and mobile screenshots were
reviewed during the session; generated test images are not project assets.

Additional browser checks passed: keyboard Space toggles tag checkboxes, invalid
age feedback, canceling the unsaved-link prompt, unavailable/network profile retry,
and complete blob-URL cleanup after leaving picture management. Email verification
removed its fragment and showed success. A deliberately delayed mock verification
also cleared an active session after the verification screen had been unmounted.

Final quality pass (2026-10-21): integrated Chrome-based browser verified Back and
Forward blocking, Stay/Discard, Escape, navigation after successful save and dialog
fit at 320px. Frontend typecheck/build, all 32 tests and git diff --check pass.
Production was built with both VITE_AUTH_MOCK=true and VITE_PROFILE_MOCK=true;
the output excludes mock fixture markers. The selector additionally requires Vite's
compile-time import.meta.env.DEV, so production cannot activate profile mock mode.

Accessibility: semantic header/main/footer and headings, skip link, labels,
keyboard-native checkboxes/selects/buttons, field error associations, visible focus,
async alert/status feedback, responsive touch targets and reduced-motion-aware
hover transitions. This is a focused manual check, not a full accessibility audit.

Firefox launch was attempted but blocked by missing host `libasound2t64`.
No Firefox or standalone Chrome coverage is claimed. Root builds/typechecks fail
on missing backend scripts, while frontend/shared checks pass. Audit reports one
high Vite finding. See [compatibility report](../docs/PROFILE_API_COMPATIBILITY.md).

### Vite Advisory

Installed Vite: **7.3.6**. npm audit reports the affected range **7.0.0 through
7.3.6**, including high-severity GHSA-587h-7wmj-h5pm (launch-editor Windows
existence-check bypass) and four other advisories grouped under the same package.
The available **7.3.7** patch is outside the reported affected range, satisfies the
existing ^7.1.0 range and requires Node ^20.19.0 or >=22.12.0 (current: 22.20.0).
A targeted compatible fix is `npm install --save-dev --workspace=@matcha/frontend
vite@^7.3.7`, followed by audit, typecheck, build and tests. This pass reports the fix
only: Vite remains unchanged, and no npm audit fix or force upgrade was run.

## File Inventory

Modified:

- `.env.example`: explicit profile mock flag.
- `src/App.tsx`: protected app/profile routes and public email verification.
- `src/main.tsx`: profile adapter composition and provider; profile CSS import.
- `package.json` and root `package-lock.json`: jsdom dev dependency for UI tests.
- `src/services/api/client.ts`: profile transport capabilities and no-store.
- `src/features/auth/utils/validation.ts`: email-change fragment route.
- `src/features/auth/utils/errors.ts`: profile/upload/email-change mappings.

Added:

- `src/features/profile/service.ts`: shared service interface and real adapter.
- `src/features/profile/mock.ts`: opt-in mutable synthetic adapter.
- `src/features/profile/ProfileProvider.tsx`: composition/context, no auth state.
- `src/features/profile/validation.ts`: date/field/upload/tag/checklist helpers.
- `src/features/profile/components.tsx`: owner resource, load state, image loader,
  shared owner/public presentation.
- `src/layouts/AppLayout.tsx`: authenticated shell and existing logout/me behavior.
- `src/pages/ProfilePage.tsx`, `EditProfilePage.tsx`, `PicturesPage.tsx`,
  `PublicProfilePage.tsx`, `AccountPage.tsx`, `VerifyEmailChangePage.tsx`.
- `src/styles/profile.css`: responsive profile styling scoped to the app shell.
- `tests/profile.test.mjs`: focused profile/transport tests.
- `tests/profile-ui.test.mjs`: rendered history/save and image-cleanup regressions.
- `PROFILE_UI.md` and `../docs/PROFILE_API_COMPATIBILITY.md`: handoff documentation.

## Remaining Integration and Subject Work

All real profile/email-change journeys await the backend compatibility fixes. The
backend environment was not available. Location editing is deliberately deferred
to feat/location-ui; discovery, search, interactions, visits, chat and notifications
remain future branches. No database, backend, shared or realtime changes were made.
Firefox verification and Vite advisory remediation remain separate follow-ups.

Suggested commit: `feat: implement contract-aligned profile and account UI`

Suggested PR description:

```text
## Summary
- Add owner/public profiles, editing, curated interests and authenticated photos.
- Add account email change and public verification while preserving memory-only auth.
- Add explicit development adapters, responsive app shell and compatibility report.

## Verification
- Shared build and frontend typecheck/build pass; 32 frontend tests pass.
- Chrome-based browser checked at 320/375/768/1024/1440px.
- Root checks blocked by missing backend scripts; Firefox blocked by host dependency.
- npm audit: one existing high Vite finding; compatible 7.3.7 fix documented.
- Add jsdom for rendered history/save/image cleanup tests; no runtime dependency changes.

## Integration
- Phase 0 real adapters are ready, but merged backend paths/envelopes/DTOs differ.
- Public profiles, protected picture reads and email-change endpoints need backend work.
- Location editing and future social interactions remain out of scope.
```
