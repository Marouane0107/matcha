# Auth UI Review

Branch: feat/auth-ui. Backend and shared contracts are unchanged. Email-change UI
belongs to the profile/account branch and is not implemented here.

## Running

From the root, run npm install, npm run typecheck and npm run build. For frontend
development without backend endpoints:

```sh
VITE_AUTH_MOCK=true npm run dev:frontend
```

Alternatively set VITE_AUTH_MOCK=true in the untracked frontend/.env. It defaults
to false; production always uses the real adapter, even if the variable is true.
There is no automatic fallback to mock on real API failure. Vite removes the mock
dynamic import from production. Use VITE_API_URL for the real API origin; the
shared paths already include /api. No new dependencies were installed.

## Routes

| Route | Access / purpose |
| --- | --- |
| /login | Guest login with username/password |
| /register | Guest registration; never automatically signs in |
| /verify-email | Public email-link verification |
| /resend-verification | Public generic email verification request |
| /forgot-password | Public generic password reset request |
| /reset-password | Public new-password form for a reset link |
| /profile | Protected authenticated placeholder, not profile implementation |
| Other paths | Redirect to profile, then login when unauthenticated |

No external return paths are accepted. Refresh loses the in-memory session by
design. Login expires after the returned expiresIn duration, with an additional
expiry check on tab focus. Profile entry fetches /me; failures are shown rather
than silently accepted. Logout always clears the local session and distinguishes
confirmed server revocation from network/API failure. Public requests send no bearer.

## Service Boundaries

Pages use AuthService through AuthProvider. The real service uses one API client;
the mock implements the same interface and uses shared envelopes before unwrapping.
Both expose the same shared data types to pages. Components never fetch directly.
The client validates envelopes and endpoint success shapes, handles 204 separately,
rejects external URLs/redirects, omits cookies, and times out after 15 seconds.
API errors and transport failures are separate classes; UI branches on ERROR_CODES.
Authenticated 401 and EMAIL_NOT_VERIFIED invalidate only the matching in-memory
session; ordinary 403 does not. No JWT parsing, signing, refresh or storage exists.

Tokens in verify/reset fragments are captured and removed via replaceState before
React mounts or any API request begins. They are never copied into history state.
Verification reuses one promise under React StrictMode to avoid consuming a token
twice; an explicit retry after a failed request is allowed. Full reload after URL
cleanup loses the link token: reopen the email link or request a fresh one.

## Synthetic Mock Scenarios

Mocks are stateless fixtures, not an account database or security implementation.
Registration/reset success does not change the fixed login fixture. All addresses
use the reserved example.invalid domain. Do not use real credentials in mock mode.

| Input | Scenario |
| --- | --- |
| Login demo / DemoPassword123 | Success; synthetic Alex Demo user and opaque development token |
| Login unverified / any nonempty password | EMAIL_NOT_VERIFIED |
| Other login credentials | INVALID_CREDENTIALS |
| Registration email `taken@example.invalid` | EMAIL_ALREADY_EXISTS |
| Registration username taken | USERNAME_ALREADY_EXISTS |
| Registration username invalid | VALIDATION_ERROR |
| Registration username common | PASSWORD_TOO_COMMON fixture, not a frontend denylist |
| Username limited or recovery email `limited@example.invalid` | RATE_LIMITED |
| Username offline or recovery email `offline@example.invalid` | Network failure |
| Username malformed or recovery email `malformed@example.invalid` | Unexpected response |
| Other structurally valid registration | Success acknowledgement, no session |
| Other forgot/resend emails | Identical generic acknowledgement regardless of existence |

Verification succeeds with a fragment token of 64 lowercase `a` characters;
reset succeeds with 64 lowercase `b` characters. Any other 64-hex token simulates
invalid/expired. Missing/malformed fragments show a local invalid-link state.
Each success token is one-use for the lifetime of the mock service instance.
ME and logout require the current opaque mock token. Reload resets fixtures.

## Checks

```sh
npm run test --workspace=frontend
npm run typecheck
npm run build
```

Tests use Node's built-in test runner, existing tsx and React server rendering;
there is no new testing framework. Coverage includes API transport/error mapping,
guards, login/logout/expiry, stale responses, fragment removal, mocks and real
adapter shape/auth consistency. Browser checks cover redirects, forms, refresh,
verification/reset and mobile layout. Real email delivery and backend security
remain dependent on Oussama's auth API implementation.

Pre-flight npm audit reported existing development-tool advisories in concurrently /
shell-quote (critical) and source-map-js (high). They were present before this branch's
edits; dependency upgrades are not included in the auth UI scope.
