# API Contract

Phase 0 contract v1. All paths, payloads and rules below are decided; endpoints are
not implemented. Import contracts, `API_ROUTES` and `ERROR_CODES` from
`@matcha/shared`. Contract changes require a focused PR reviewed by the other
developer, not local duplicate types. Authentication is defined in
[Auth strategy](AUTH_STRATEGY.md).

## Transport and Envelopes

REST uses JSON UTF-8 except picture uploads/downloads. Fields use camelCase, IDs are UUID
strings, instants are ISO 8601 UTC strings, and birth dates are `YYYY-MM-DD`.
`ApiSuccess<T>` and `ApiResponse<T>` wrap the endpoint's data type:

```json
{ "success": true, "data": {}, "error": null }
```

```json
{
  "success": false,
  "data": null,
  "error": { "code": "VALIDATION_ERROR", "message": "Human readable message" }
}
```

`ApiError` is the inner error object. `ApiFailure` is the failure envelope.
Responses with status 204 have no body and must not be JSON-parsed. Picture GET
success returns image bytes; its errors still use JSON. All other successes and
errors use the envelope. No stack traces, SQL details or secrets.

`API_ROUTES` contains complete paths including `/api` and Express-style parameter
placeholders. The future client adapter replaces placeholders with URL-encoded
values and resolves the path against the origin of `VITE_API_URL`; it must not
concatenate `/api` twice. Example: base `http://localhost:3000/api` plus
`API_ROUTES.AUTH.LOGIN` resolves to `http://localhost:3000/api/auth/login`.
Register static `suggestions` and `search` routes before `:username`.

## Pagination

All list responses marked `Page<T>` below mean `PaginatedResponse<T>` with data:

```json
{
  "items": [],
  "pagination": { "page": 1, "limit": 20, "total": 0, "totalPages": 0 }
}
```

`P` means query parameters `page` (integer >=1, default 1) and `limit` (integer
1..100, default 20). `total` counts visible matching rows before pagination;
`totalPages = ceil(total / limit)`. An out-of-range page succeeds with empty items.
Lists use descending creation time and descending ID as a tie-break unless noted.
Page-based pagination can shift during concurrent writes; clients deduplicate by ID.

## Endpoint Matrix

`Yes` means a valid JWT for an email-verified account. `No` means public.
`None` means no body or query parameters are accepted. Response names describe
`data` inside `ApiResponse<T>`, except `Page<T>` and 204 as defined above.
Every endpoint also follows the common error rules below; the final column lists
additional domain errors. No unspecified query keys or body fields are accepted.

### Auth

| Method and path | Auth | Body | Query | Success | Domain errors |
| --- | --- | --- | --- | --- | --- |
| POST /api/auth/register | No | RegisterRequest | None | 201 Acknowledgement | 409 EMAIL_ALREADY_EXISTS, USERNAME_ALREADY_EXISTS; 422 PASSWORD_TOO_COMMON |
| POST /api/auth/login | No | LoginRequest | None | 200 AuthResponse | 401 INVALID_CREDENTIALS; 403 EMAIL_NOT_VERIFIED |
| POST /api/auth/logout | Yes | None | None | 204 | Common errors only |
| GET /api/auth/me | Yes | None | None | 200 AuthUser | Common errors only |
| POST /api/auth/verify-email | No | VerifyEmailRequest | None | 200 Acknowledgement | 400 INVALID_VERIFICATION_TOKEN |
| POST /api/auth/resend-verification | No | ResendVerificationRequest | None | 200 Acknowledgement | Common errors only |
| POST /api/auth/forgot-password | No | ForgotPasswordRequest | None | 200 Acknowledgement | Common errors only |
| POST /api/auth/reset-password | No | ResetPasswordRequest | None | 200 Acknowledgement | 400 INVALID_RESET_TOKEN; 422 PASSWORD_TOO_COMMON |
| POST /api/auth/change-email | Yes | ChangeEmailRequest: newEmail, password | None | 200 Acknowledgement | 403 INVALID_CURRENT_PASSWORD; 409 EMAIL_ALREADY_EXISTS; 422 VALIDATION_ERROR |
| POST /api/auth/verify-email-change | No | VerifyEmailChangeRequest: token | None | 200 Acknowledgement | 400 INVALID_EMAIL_CHANGE_TOKEN; 409 EMAIL_ALREADY_EXISTS |

Register creates an unverified user and empty profile atomically; no login token
is returned. Login uses username and password, not email. `Acknowledgement` is
`{ message: string }`; copy is not a machine identifier. Resend/forgot responses
do not reveal account existence or verification state.

Email change verifies the current password before checking newEmail availability.
The existing verified email remains active until the new address is verified.
Store only a pending address and SHA-256 digest of a random one-use token, valid
24 hours. Repeating change-email replaces the pending request and invalidates its
old token. Pending addresses are not reserved: verification atomically rechecks
active-email uniqueness, replaces email, clears pending fields, updates
email_verified_at and increments token_version. Conflicts leave the original email
unchanged and clear the failed pending request; request a new link after resolving
the conflict. Success invalidates every session and requires login, with no new JWT.
The future socket layer disconnects all devices. See AUTH_STRATEGY.md for recovery
token invalidation and link handling. The current password field is checked against
its hash, not subjected to the new-password denylist policy.

### Profile and Location

| Method and path | Auth | Body | Query | Success | Domain errors |
| --- | --- | --- | --- | --- | --- |
| GET /api/profile/me | Yes | None | None | 200 UserProfile | 404 PROFILE_NOT_FOUND |
| PATCH /api/profile/me | Yes | ProfileUpdateRequest | None | 200 UserProfile | 404 PROFILE_NOT_FOUND |
| GET /api/profiles/:username | Yes | None | None | 200 PublicProfile | 404 PROFILE_NOT_FOUND (also blocked/unverified) |
| POST /api/profile/pictures | Yes | multipart field `picture`: one file | None | 201 PictureCollection | 422 UPLOAD_INVALID_TYPE, UPLOAD_TOO_LARGE; 409 UPLOAD_LIMIT_REACHED |
| GET /api/profile/pictures/:pictureId | Yes | None | None | 200 image bytes with verified Content-Type | 404 NOT_FOUND (also hidden by block/unverified owner) |
| DELETE /api/profile/pictures/:pictureId | Yes | None | None | 200 PictureCollection | 404 NOT_FOUND (also not owned) |
| PATCH /api/profile/pictures/:pictureId/main | Yes | None | None | 200 PictureCollection | 404 NOT_FOUND (also not owned) |
| GET /api/tags | Yes | None | None | 200 Tag[] | Common errors only |
| PATCH /api/profile/location | Yes | LocationUpdateRequest | None | 200 UserProfile | 404 PROFILE_NOT_FOUND |

`UserProfile` is owner-only and includes email, birth date, exact coordinates and
completion state. `PublicProfile` excludes these; it exposes calculated age and
city/neighborhood only. `isOnline` is false when no valid sockets remain;
`lastSeen` is null while online or if never online. IDs identify users, including
`PublicProfile.id`. Public relationship booleans are relative to the viewer.

Username is immutable. Email changes use the auth flow above, never profile PATCH. Profile
PATCH supports only fields in `ProfileUpdateRequest`, requires at least one field,
and replaces the full tag set if `tagIds` is supplied. Omitted fields stay unchanged.
Location PATCH replaces the entire location object; it does not change search defaults
globally. GPS input is `{ mode: "gps", city, neighborhood, latitude, longitude }`:
browser geolocation supplies coordinates only after explicit consent. Manual input
is `{ mode: "manual", city, neighborhood }`, with neighborhood nullable; coordinates
are forbidden in manual requests. Users select/type city and optionally neighborhood,
never latitude/longitude. The backend location service geocodes the supplied place
into an approximate city/neighborhood centroid before persistence and returns the
resolved Location in UserProfile. An ambiguous/unrecognized place returns 422
VALIDATION_ERROR and leaves the old location unchanged; the user refines place text
(city may include region/country). A geocoder outage returns 500 INTERNAL_ERROR,
never made-up coordinates. Geocoder/provider selection belongs to the later location
implementation; conversion ownership and wire shapes are fixed here. Tags are a
reusable curated catalog, sorted by name then ID; there is no
user-created tag endpoint. Picture responses return the complete ordered array.
The first picture becomes main; deleting main promotes the lowest remaining position.
At most five pictures, positions 1..5, exactly one main whenever pictures exist.

Completion requires verified email, first/last name, adult birth date, gender,
nonblank bio, at least one tag, a main picture and location. No explicit orientation
selection is required: unspecified preference defaults to `everyone` (the subject's
bisexual default). Defaults: empty bio/tags/pictures, fame 0, sexualPreference
everyone, null gender/birth date/location. Profile PATCH omission preserves the
current preference, including this default; explicit null is invalid.
Incomplete profiles can edit themselves but are excluded from discovery.

### Browse and Search

| Method and path | Auth | Body | Query | Success | Domain errors |
| --- | --- | --- | --- | --- | --- |
| GET /api/profiles/suggestions | Yes | None | SearchQuery | 200 `Page<ProfileSearchResult>` | 422 PROFILE_INCOMPLETE, LOCATION_REQUIRED |
| GET /api/profiles/search | Yes | None | SearchQuery | 200 `Page<ProfileSearchResult>` | 422 PROFILE_INCOMPLETE, LOCATION_REQUIRED |

Only backend filtering is allowed: never fetch all users to filter in the browser.
Both endpoints exclude self, unverified/incomplete profiles, either-direction
blocks and mutually incompatible preferences. `men` accepts gender `man`, `women`
accepts `woman`, and `everyone` accepts all genders including `non_binary`.
Both users must accept the other's gender. An unspecified initial preference is
everyone, never null or a reason to exclude an otherwise complete profile. Use the
same default in matching, search, mocks and eventual seed data.

SearchQuery wire encoding (all optional):

| Query key | Rules and default |
| --- | --- |
| minAge, maxAge | Integer 18..120, inclusive; default 18 and 120; min <= max |
| minFame, maxFame | Number 0..100, inclusive; default 0 and 100; min <= max |
| maxDistance | Finite number >0 and <=20000, kilometers; absent means no radius limit |
| location | One `latitude,longitude` string, e.g. `33.5731,-7.5898`; overrides search origin only |
| tags | Comma-separated unique tag UUIDs, maximum 10; all requested tags must match |
| sortBy | age, distance, fame, commonTags; default distance |
| sortOrder | asc or desc; default asc |
| page, limit | P rules above |

The shared `SearchQuery.location` is an object; the adapter serializes it as above.
Empty values, repeated keys, malformed numbers, unknown tags and unknown keys are
422 VALIDATION_ERROR. Omitted location uses the owner's saved coordinates; absence
of both returns LOCATION_REQUIRED before PROFILE_INCOMPLETE. Suggestions with no
explicit sort use distance ascending, commonTags descending, fame descending, ID
ascending. Explicit sorts and default search sorting use ID ascending as final tie.
`commonTags` counts overlap with the viewer's interests, not just filter tags.
`distanceKm` is rounded to the nearest kilometer in output; filtering/sorting uses
unrounded server-side distance. Birth dates and exact coordinates never leave the
backend in discovery results. Fame is `min(100, receivedLikeCount)` as a number;
only current likes count. These rules define behavior, not an implemented algorithm.

### Interactions

| Method and path | Auth | Body | Query | Success | Domain errors |
| --- | --- | --- | --- | --- | --- |
| POST /api/profiles/:userId/like | Yes | None | None | 201 LikeStatus | 400 CANNOT_LIKE_SELF; 403 USER_BLOCKED; 404 PROFILE_NOT_FOUND; 409 ALREADY_LIKED; 422 PROFILE_PICTURE_REQUIRED, PROFILE_INCOMPLETE |
| DELETE /api/profiles/:userId/like | Yes | None | None | 200 LikeStatus | 404 LIKE_NOT_FOUND |
| GET /api/interactions/likes-received | Yes | None | P | 200 `Page<Like>` | Common errors only |
| GET /api/interactions/connections | Yes | None | P | 200 `Page<Connection>` | Common errors only |
| POST /api/profiles/:userId/view | Yes | None | None | 201 Acknowledgement | 404 PROFILE_NOT_FOUND (also blocked); 422 VALIDATION_ERROR for self |
| GET /api/interactions/views | Yes | None | P | 200 `Page<ProfileView>` | Common errors only |
| POST /api/profiles/:userId/block | Yes | None | None | 201 Block; 200 Block if already blocked | 404 PROFILE_NOT_FOUND; 422 VALIDATION_ERROR for self |
| DELETE /api/profiles/:userId/block | Yes | None | None | 204 (also already absent) | Common errors only |
| POST /api/profiles/:userId/report | Yes | ReportRequest | None | 201 Report | 404 PROFILE_NOT_FOUND; 422 VALIDATION_ERROR for self |

Like requires the actor's main picture (checked before other completeness errors)
and both profiles complete. Connections are mutual likes, no separate connection
resource/ID; `connectedAt` is the later like timestamp. Unlike dissolves a
connection only when mutual likes existed. Create UNLIKE only for the other person
when that removal breaks an existing mutual connection; removing a one-way like
creates no UNLIKE notification or connection:removed event. Determine mutuality
under the pair transaction locks before deleting. Blocking atomically removes both likes, dissolves any connection,
and prevents discovery, contact and historical message access in both directions.
Unblocking does not restore likes. Reporting never automatically blocks someone.
Block/unblock/report remain possible even when the other person blocked the actor.
Read lists exclude either-direction blocks. View records are append-only, one per
explicit request; GET public profile alone has no visit side effect. Duplicate
view submissions are possible and are rate-limited. `viewedAt` maps to DB created_at.
Views/received likes are ordered newest-first; connections by connectedAt descending
then other user ID descending. `Like.id` and `ProfileView.id` are record IDs.

### Chat and Notifications

| Method and path | Auth | Body | Query | Success | Domain errors |
| --- | --- | --- | --- | --- | --- |
| GET /api/conversations | Yes | None | P | 200 `Page<ConversationPreview>` | Common errors only |
| GET /api/conversations/:userId/messages | Yes | None | P | 200 `Page<ChatMessage>` | 403 USER_BLOCKED, NOT_CONNECTED; 404 PROFILE_NOT_FOUND |
| GET /api/notifications | Yes | None | P | 200 `Page<Notification>` | Common errors only |
| GET /api/notifications/unread-count | Yes | None | None | 200 UnreadCountResponse | Common errors only |
| PATCH /api/notifications/:notificationId/read | Yes | None | None | 200 NotificationReadResult | 404 NOT_FOUND (also not owned) |
| PATCH /api/notifications/read-all | Yes | None | None | 200 ReadAllNotificationsResponse | Common errors only |

Conversations include current connections without messages (`lastMessage: null`),
ordered by latest message time or connectedAt, then other user ID descending.
Messages are returned newest-first; UI may reverse a page for display. Historical
messages are hidden on disconnection and visible again if a new mutual connection
forms. Messages are sent only through the typed socket contract, not REST.
Notifications and unread counts exclude blocked actors consistently. Read operations
are idempotent; read-all affects visible records present at request time and returns
the current unread count, which may increase due to concurrent new notifications.
Notifications with deleted actors expose null actorId/actorUsername and empty metadata.

## HTTP Status and Error Rules

All endpoints may return 500 INTERNAL_ERROR. Valid authenticated routes may return
401 UNAUTHORIZED for missing, invalid, expired or revoked tokens and 403
EMAIL_NOT_VERIFIED for accounts no longer verified. Ownership failures on private
resources are 404 NOT_FOUND. Never return someone else's private data.

| Status | Meaning / code |
| --- | --- |
| 200 OK | Read, update, or documented idempotent success |
| 201 Created | A new account, picture or interaction was created |
| 204 No Content | Successful logout/unblock; no envelope |
| 400 Bad Request | Malformed JSON/multipart, INVALID_VERIFICATION_TOKEN, INVALID_RESET_TOKEN, INVALID_EMAIL_CHANGE_TOKEN, CANNOT_LIKE_SELF; malformed input uses VALIDATION_ERROR |
| 401 Unauthorized | UNAUTHORIZED or INVALID_CREDENTIALS on login |
| 403 Forbidden | FORBIDDEN, EMAIL_NOT_VERIFIED, INVALID_CURRENT_PASSWORD, USER_BLOCKED, NOT_CONNECTED, MESSAGE_NOT_ALLOWED |
| 404 Not Found | NOT_FOUND, PROFILE_NOT_FOUND, LIKE_NOT_FOUND |
| 409 Conflict | EMAIL_ALREADY_EXISTS, USERNAME_ALREADY_EXISTS, ALREADY_LIKED, UPLOAD_LIMIT_REACHED |
| 422 Unprocessable Entity | VALIDATION_ERROR, PASSWORD_TOO_COMMON, PROFILE_INCOMPLETE, PROFILE_PICTURE_REQUIRED, LOCATION_REQUIRED, UPLOAD_INVALID_TYPE, UPLOAD_TOO_LARGE |
| 429 Too Many Requests | RATE_LIMITED, Retry-After header in seconds |
| 500 Internal Server Error | INTERNAL_ERROR; generic message, details only in server logs |

Validation applies before business rules; after auth and validation, a block takes
precedence over connection checks. Every typed error comes from `ERROR_CODES`.
Never branch on human-readable `message`. Unknown paths return 404 NOT_FOUND once
the error middleware is implemented. The current placeholder Express 404 is not
an implementation of this contract.

## Request Validation

Frontend validation is UX only. Backend validation is authoritative, explicit and
controlled; shared types are compile-time contracts, not validators. Reject unknown
keys and never pass request objects directly to persistence.

| Input | Contract |
| --- | --- |
| Email | Trim, lowercase, <=254 characters, valid mailbox/domain syntax, no whitespace/control characters; verify ownership by email |
| Username | Lowercase after trimming; 3..30 ASCII letters/digits/underscore; starts with a letter; reserve `me`, `search`, `suggestions`, `auth`, `api` |
| Password | 12..128 Unicode code points, at least one letter and one number; reject common/dictionary/known-compromised passwords through the deterministic backend local denylist policy in AUTH_STRATEGY.md (422 PASSWORD_TOO_COMMON); never trim, log or silently truncate; hash with Argon2id |
| Names | Trimmed 1..50 code points each; reject control characters |
| IDs | UUID syntax for every user, tag, picture, notification and clientMessageId |
| Birth date | Real calendar date, exact YYYY-MM-DD, age 18..120 at current UTC date |
| Gender / preference | Exactly shared union values; initial omitted preference defaults to everyone; reject explicit null and arbitrary enum strings |
| Bio | Plain text, trim ends, <=1000 code points; empty allowed during onboarding |
| Tags | Up to 10 distinct existing tag UUIDs; no free-form tags |
| Location | City 1..100 trimmed code points, neighborhood null or 1..100; gps requires consent-sourced finite coordinates in latitude -90..90 and longitude -180..180; manual forbids coordinate input and backend resolves approximate coordinates within those bounds |
| Queries | Strict numeric parsing and the documented ranges; reject duplicates, unknown keys and NaN/Infinity |
| Message | Plain text, trim ends, 1..2000 Unicode code points; authenticated sender derived server-side |
| Report | Shared reason enum; details trimmed 1..2000 code points |
| Tokens | Opaque 64-character hexadecimal verification/reset/email-change tokens; purpose and expiry checked server-side |
| Upload | Exactly one picture field; JPEG/PNG/WebP only; <=5 MiB; decoded image <=20 megapixels; inspect signature and decode, never trust filename/MIME alone |

Files get randomized storage keys, metadata stripped by re-encoding, no executable
or SVG content. Delete/main changes require ownership. Reads allow the owner or an
authenticated viewer allowed to view the owner's public profile (no either-direction
block). Picture.url is an absolute same-API-origin URL for GET
/api/profile/pictures/:pictureId; raw storage paths are never exposed. The client
image service fetches it with Authorization, converts the response to a blob URL,
and revokes that URL on unmount/logout. Never attach tokens to URLs or external
origins. Set Cache-Control: private, no-store and X-Content-Type-Options: nosniff.
There is no direct public uploads directory mount. This read method complements
the required upload/delete/main routes without adding another path constant.

Initial limits: JSON bodies 32 KiB; uploads 5 MiB/file; authenticated REST 120
requests/minute/user; login 10 attempts/15 minutes per IP and normalized username;
register/resend/forgot/reset/verify (including verify-email-change) 5/minute/IP and
email where supplied; change-email 5/minute/user and IP; views
30/minute/user. Return 429 with retry timing. Values may later be tuned through a
contract review, but implementations must begin with these defaults.
