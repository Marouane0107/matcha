# Authentication Strategy

Phase 0 decision: one short-lived access JWT, no refresh tokens and no cookies.
The backend owns authentication and authorization. Nothing here is implemented yet.

## Login and Storage

- POST /api/auth/login accepts username/password, and only verified users can log in.
- Success data is AuthResponse: user, accessToken, tokenType `Bearer`, expiresIn
  in seconds (900). Shared code contains types only, never credential values.
- Access JWT: HS256, strong server-only JWT_SECRET (at least 32 random bytes),
  issuer `matcha-api`, audience `matcha-web`, claims sub (UUID), ver (integer
  token_version), iat and exp. Explicitly allowlist the algorithm.
- JWT_EXPIRES_IN is `15m`; reject a missing/invalid value at auth startup. The
  credential-free template sets this public policy value, not a secret.
- Frontend stores the access token only in memory, never localStorage,
  sessionStorage, URL query parameters or persisted state. Reloading the page or
  expiration requires login again. No silent refresh or refresh endpoint exists.
- REST sends `Authorization: Bearer <accessToken>`. Do not attach it to external
  origins. HTTPS is mandatory outside localhost development.
- Backend checks signature, issuer, audience, expiry, account existence,
  verification and token_version on each protected request. No protected API
  accepts an actor/user ID as a substitute for authenticated identity.

## Current User and Logout

GET /api/auth/me returns fresh AuthUser data, not claims copied from the JWT. It
does not issue or extend a token. With no in-memory token the frontend stays logged
out; with a token it calls me to initialize state. Any 401 clears auth state and
disconnects sockets. A 403 is shown as a permission/business error, not blindly
treated as logout (EMAIL_NOT_VERIFIED also ends the local session).

POST /api/auth/logout requires a valid token, atomically increments users.token_version
and disconnects all sockets for that user, then returns 204. This deliberately logs
out every device. Concurrent logout requests are idempotent in effect; one may
receive 401 after the first revokes its token. Clear the local token even if logout
fails, but do not claim server revocation occurred on network failure; stolen tokens
then remain valid until their 15-minute expiry. There is no token blacklist table.

Password reset also increments token_version and disconnects all devices. Routine
profile edits do not invalidate JWTs. A later login uses the current version.

## Email Verification

### New Password Policy

Register and reset must enforce 12..128 Unicode code points with at least one letter
and one number, plus a deterministic server-side common-password check. Reject
common, dictionary-based and known-compromised passwords using a versioned local
denylist covering common passwords, dictionary words with predictable numeric
suffixes, and known breached values. The auth implementation bundles the list,
records its source/license/version and tests representative rejected examples.
No remote availability dependency and no frontend-only enforcement are allowed.
For denylist comparison only, normalize with NFKC and lowercase; compare both the
whole candidate and a candidate with leading/trailing ASCII digits removed against
equivalently normalized entries. Never normalize or trim the password passed to
Argon2id or silently change credentials. Return 422 PASSWORD_TOO_COMMON on a hit;
structural failures remain VALIDATION_ERROR. A missing/unreadable list fails auth
startup rather than bypassing checks. No finite list detects every compromised
password; keep the version maintained. Login/current-password verification checks
the stored hash, not the new-password policy. No list or library is installed in Phase 0.

### Registration Verification

Registration creates user/profile in one transaction, hashes the password with
Argon2id (minimum 19 MiB memory, 2 iterations, parallelism 1), and sends an opaque
cryptographically random 32-byte token encoded as 64 hex characters. Store only
its SHA-256 digest and expiry on users, not the raw token. Verification tokens
expire after 24 hours. Resending replaces the digest, invalidating the previous
token. Keep database update and email failure handling explicit; resend is the
recovery path if delivery fails.

Email links target `/verify-email#token=<token>` on FRONTEND_URL. The UI reads the
fragment, immediately removes it from browser history, and POSTs VerifyEmailRequest
to the backend. Do not send a bearer token for this operation. Atomically require
matching digest, unexpired token and unverified user, set email_verified_at, and
clear digest/expiry. Reuse/expiry gives 400 INVALID_VERIFICATION_TOKEN. Success does
not log in automatically. Never log raw tokens, passwords or request auth headers.

Resend always returns the same 200 acknowledgement whether the email is unknown,
already verified or eligible. Avoid account-dependent timing where practical.
Registration intentionally returns duplicate email/username 409 errors for form UX;
this known enumeration tradeoff is restricted by rate limits, unlike reset/resend.

## Password Reset

Forgot-password always returns the same 200 acknowledgement. For an eligible
verified account, generate a separate random token with the same format; store
only its SHA-256 digest and a 30-minute expiry. New requests invalidate old tokens.
Link: `/reset-password#token=<token>`. Remove the fragment immediately after reading.
ResetPasswordRequest contains token and new password. Atomically consume the
unexpired reset digest, replace password_hash, clear reset fields, increment
token_version, clear any pending email-change fields, and disconnect sockets.
Return 200 acknowledgement, no access token.
Reset does not verify an email address. Verification and reset tokens cannot be
interchanged. These are opaque one-use tokens, not JWTs.

## Email Change

Username remains immutable. POST /api/auth/change-email requires a valid verified
session and ChangeEmailRequest `{ newEmail, password }`. Verify the current password
first (403 INVALID_CURRENT_PASSWORD, without logging out the valid session), then
normalize/validate the new address and check active-email uniqueness. Same-as-current
email is 422 VALIDATION_ERROR; another active owner is 409 EMAIL_ALREADY_EXISTS.
Under the user row lock, recheck the password hash has not changed since verification
(or verify while locked), replace pending_email, generate a fresh cryptographically
random 32-byte token encoded as 64 hex characters, and store only its SHA-256 digest
and 24-hour expiry. Return 200 acknowledgement without changing users.email,
email_verified_at or token_version yet. Repeating the request replaces all pending
fields and is the resend/recovery mechanism if mail delivery fails.

Send the link to the pending address using FRONTEND_URL plus
`/verify-email-change#token=<token>`. The frontend removes the fragment after reading
and POSTs VerifyEmailChangeRequest to public POST /api/auth/verify-email-change.
The possession token authorizes this operation, so no bearer session is required.
Tokens are purpose-bound: registration/reset tokens never authorize email changes.
Malformed, expired, replaced or consumed tokens return 400 INVALID_EMAIL_CHANGE_TOKEN.

Verification locks the user row and atomically checks digest/expiry, rechecks active
email uniqueness, promotes pending_email to email, sets email_verified_at to now,
clears all pending fields, clears any registration-verification/reset token fields,
increments token_version and updates updated_at. The active-email unique constraint
is the final arbiter in concurrent claims. Pending emails are not reservations:
multiple requests may target the same unclaimed address, but only one can activate
it. On a uniqueness conflict, retain the original active email and clear the failed
pending request in a completed cleanup transaction, returning 409 EMAIL_ALREADY_EXISTS.
An expired request cannot activate; clear its pending fields when encountered.

Success returns 200 acknowledgement, no JWT. All sessions are immediately invalid
on their next auth check; the future socket layer disconnects all active sockets.
The verifying browser clears its in-memory token and asks for login. Notify the old
address of completion without including tokens; delivery failure must not roll back
the verified change. A previously issued reset token for the old email cannot be
used afterward. A password reset clears pending changes to defeat abandoned takeover
attempts. Serialize reset and email-change verification on the same user row.

Rate limit requests to 5/minute/user and IP; verification to 5/minute/IP. Do not log
either address's token. Current email stays verified and usable until success.

## Socket Authentication and CORS

Send `auth: { accessToken }` in the Socket.IO handshake, never a query token.
The server checks the same JWT rules, authenticates room membership server-side,
rechecks authorization/version for every client event, and disconnects at expiry.
See [Socket contracts](SOCKET_EVENTS.md) for acknowledgements and reconnect rules.
REST CORS allows exactly FRONTEND_URL, methods GET/POST/PATCH/DELETE/OPTIONS and
Authorization/Content-Type headers; credentials are disabled. Socket origins use
the same allowlist. No credential cookies means cookie-based CSRF is not part of
this design; XSS prevention and strict token handling still matter.

## Frontend Routes

Marouane's first branch uses `/register`, `/login`, `/verify-email`,
`/forgot-password`, `/reset-password`, and a protected `/profile` placeholder as
the post-login destination until profile UI exists. Production hosting needs SPA
fallback to index.html. Allow only same-origin relative return paths after login.
These are routing decisions, not pages created during Phase 0.

The profile/account branch adds a protected email-change form and public
`/verify-email-change` route with the same fragment handling. Do not create pages now.
