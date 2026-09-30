# API Contract

Status: template only. No endpoint is implemented or final.

Before implementing an endpoint, Marouane and Oussama must agree in a pull request
on method/path, purpose, authentication and authorization, path/query parameters,
request body, validation/limits, response types, status codes, and error codes.
For collections, agree on pagination, filtering, and sorting. Record privacy
rules, side effects, and acceptance examples. Update shared types in the same PR.
TypeScript types do not replace server-side input validation.

## Standard Envelopes

Success:

```json
{
  "success": true,
  "data": {},
  "error": null
}
```

Error:

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message"
  }
}
```

Use `ApiResponse<T>` from `shared/contracts/api.types.ts`. Use meaningful HTTP
status codes alongside the envelope. Never expose SQL errors, stack traces,
credentials, private email addresses, or other users' sensitive fields.

## Example Contract (Not Final)

### GET /api/profiles/:id

- Purpose: retrieve a public profile.
- Owner/reviewer: TODO.
- Authentication/authorization and visibility rules: TODO.
- Path parameter `id`: TODO validation and identifier format.
- Query parameters/request body: TODO.
- Success status and `PublicProfile` fields: TODO.
- Error statuses/codes: TODO (including missing or inaccessible profiles).
- Rate limits and acceptance cases: TODO.
- Agreement date/PR: TODO.

Response shape only, not a complete profile:

```json
{
  "success": true,
  "data": {},
  "error": null
}
```

## Auth

TODO contracts: signup, login/logout, email verification, password reset, session
transport and lifecycle. No credential/token contract is final.

## Profile

TODO contracts: owner/public views, profile edits, pictures, interests, location.

## Browse

TODO contracts: recommendations, pagination, filters and sorting.

## Search

TODO contracts: search criteria, limits, filters, sorting and pagination.

## Likes

TODO contracts: like/unlike behavior and visibility rules.

## Connections

TODO contracts: connection lifecycle, eligibility and removal.

## Chat

TODO contracts: authorized history access, pagination and message delivery rules.

## Notifications

TODO contracts: listing, unread state and read acknowledgement.

## Block/report

TODO contracts: block/unblock, reporting, privacy and downstream effects.
