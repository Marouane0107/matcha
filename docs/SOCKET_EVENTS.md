# Socket Events

Phase 0 contract v1. No socket client/server or handlers are implemented. Import
`SOCKET_EVENTS`, `ClientToServerEvents`, `ServerToClientEvents`, and payload types
from `@matcha/shared`. Never invent event strings locally. The two directional
constant maps remain exported; SOCKET_EVENTS combines their eight unique names.

Use the default namespace `/` and Socket.IO path `/socket.io`. Handshake auth is
`SocketAuth` (`{ accessToken: string }`). Browser URL comes from VITE_SOCKET_URL,
without `/api`. JWT rules are in [Auth strategy](AUTH_STRATEGY.md).

## Client to Server

Each event takes a single direct payload object followed by a required acknowledgement
callback. The ack receives `ApiResponse<T>`; success has error null, failure has
data null and a shared error code. There is no additional data wrapper in event
payloads themselves. Actors always come from the authenticated socket.

| Constant / event | Exact payload | Ack data | Failures |
| --- | --- | --- | --- |
| CHAT_SEND / chat:send | SendMessagePayload: receiverId, clientMessageId, content | ChatMessage | VALIDATION_ERROR, PROFILE_NOT_FOUND, USER_BLOCKED, NOT_CONNECTED, MESSAGE_NOT_ALLOWED, RATE_LIMITED |
| NOTIFICATION_READ / notification:read | NotificationReadPayload: notificationId | NotificationReadResult: notificationId, read=true, unreadCount | VALIDATION_ERROR, NOT_FOUND, RATE_LIMITED |
| USER_ONLINE / user:online | Empty object `{}` only; no client-supplied userId/status | UserStatusPayload: userId, isOnline, lastSeen | VALIDATION_ERROR, RATE_LIMITED |

All events may also fail with UNAUTHORIZED, EMAIL_NOT_VERIFIED or INTERNAL_ERROR.
Unauthenticated handshakes use Socket.IO's built-in `connect_error`, with error.data
equal to ApiError. No custom auth event is added. Invalid/expired sessions are
disconnected; do not silently retry login. Missing callbacks are malformed events:
do not execute their mutations. JSON payload limit is 16 KiB.

## Server to Client

Server events do not require acknowledgements. Payload shapes are exact shared types.

| Constant / event | Payload | Recipients |
| --- | --- | --- |
| CHAT_MESSAGE / chat:message | MessageReceivedPayload: `{ message: ChatMessage }` | All sockets of sender and receiver after commit |
| NOTIFICATION_NEW / notification:new | Notification directly | Recipient's sockets only |
| CONNECTION_NEW / connection:new | Connection: `{ user: PublicProfile, connectedAt: string }` | Both users, with the other person's viewer-relative public profile |
| CONNECTION_REMOVED / connection:removed | ConnectionRemovedPayload: `{ userId: string }` | Both former participants, other user's ID; no reason exposing a block |
| USER_STATUS / user:status | UserStatusPayload: userId, isOnline, lastSeen | Current unblocked connections only |

ChatMessage fields: id, senderId, receiverId, clientMessageId, content, createdAt.
All IDs are UUID strings and timestamps UTC ISO strings. No email, birth date,
exact coordinates or credentials in public events. `lastSeen` is null when online;
on final disconnect it is the server timestamp (null if never online in REST).

## Delivery, Ordering and Authorization

- SendMessagePayload has no senderId. Validate 1..2000 code points of trimmed plain
  text and a current mutual connection; blocks take precedence. Sending to self is
  MESSAGE_NOT_ALLOWED. Sender/receiver rooms are assigned only by the server.
- clientMessageId is a UUID generated once per attempted message by the client.
  Enforce uniqueness on (sender_id, client_message_id). Replaying the same tuple
  with identical receiver/content returns the original ChatMessage without another
  insert/notification. Reuse with different content is VALIDATION_ERROR. Check
  current authorization before returning an old message.
- Persist message and its notification together, commit, then acknowledge and
  emit. Ack and event arrival order is not guaranteed; deduplicate by message ID
  (clientMessageId reconciles optimistic sends). Server timestamps plus ID define
  ordering. Never show untrusted message HTML.
- Ack timeout is 10 seconds. The client may offer retry with the same ID, never
  silently create a new one. No durable socket replay guarantee: after reconnect,
  fetch REST conversations/messages/notifications and unread count to recover gaps.
- Presence is online when at least one authenticated, unexpired socket exists.
  The server marks it on successful connection; user:online is an idempotent
  resynchronization request. Only the last device disconnect sets last_seen.
  Presence is ephemeral; startup begins offline rather than trusting stale DB flags.
- Logout/reset disconnect every device. Expiry disconnects that socket. Every
  mutation checks token_version and resource permissions again.
- Unlike/block immediately stops message access. Blocking removes likes and
  emits only the generic connection removal, not a revealing block event. It
  suppresses future notifications/presence between that pair. Update clients'
  local connection state and refetch REST on reconnect.
- Rate limits per user across sockets: chat:send 30/minute, notification:read
  120/minute, user:online 12/minute. Fail with RATE_LIMITED. Limits apply before
  mutation; never bypass them by opening another tab.

## Notification Semantics

Types are exactly LIKE, PROFILE_VIEW, MESSAGE, CONNECTION, UNLIKE. Notification
contains id, type, actorId, actorUsername, read, createdAt and metadata. Actor fields
are nullable for deleted accounts; metadata is `{ messageId: string }` for MESSAGE
and `{}` for other types (also `{}` after actor/message deletion).

A new one-way like creates LIKE for its recipient. A reciprocal like additionally
creates CONNECTION for both people and emits connection:new. Removing a like
creates UNLIKE for its former recipient only if it breaks an existing mutual
connection. Removing a one-way like generates neither UNLIKE nor connection:removed.
Check pre-removal mutuality under the pair transaction locks; persist the notification
only for that transition. An explicit non-self profile view creates
PROFILE_VIEW; a persisted message creates MESSAGE for its receiver. Blocking itself
creates no UNLIKE notification; do not expose the block. Never notify self for
LIKE/PROFILE_VIEW/MESSAGE/UNLIKE. CONNECTION intentionally notifies both sides.

notification:read and REST read use the same idempotent operation and return the
current count. Only owners can mark records read. read-all is REST only; no ninth
event is introduced. Other tabs refresh counts on focus/reconnect, and after read
operations; cross-device instantaneous read-state synchronization is not promised.
