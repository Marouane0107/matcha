# Socket Events

Status: event names reserved; no connections, handlers or payload contracts are
implemented. Marouane owns the client and Oussama owns the server. Both must agree
on payloads before implementation.

Import event names from `shared/constants/socket-events.ts`; never duplicate
string literals. `CLIENT_TO_SERVER_EVENTS` and `SERVER_TO_CLIENT_EVENTS` are the
single event-name dictionary for both workspaces.

## Payload Format

Expected format: one JSON-serializable object per event. Exact fields, required
properties, identifier types, validation and size limits remain TODO. Do not send
database rows or secrets directly. Event actors must be derived from the
authenticated connection, not trusted from client-supplied IDs.

Provisional documentation example only, not a required envelope:

```json
{
  "data": {}
}
```

Decide whether to use this envelope or a direct typed object together. The empty
object above is not a valid finalized event payload.

## Client -> Server

| Event | Intended meaning | Expected payload content (all TODO) |
| --- | --- | --- |
| chat:send | Request message delivery | Destination reference, message content, optional deduplication reference |
| notification:read | Acknowledge a notification | Notification reference; ownership checked server-side |
| user:online | Signal presence intent | Presence/session metadata if needed; identity from authenticated socket |

## Server -> Client

| Event | Intended meaning | Expected payload content (all TODO) |
| --- | --- | --- |
| chat:message | Deliver a persisted message | Agreed message contract and delivery metadata |
| notification:new | Deliver a new notification | Agreed notification contract |
| connection:new | Announce a connection | Connection reference and allowed public participant data |
| connection:removed | Announce loss of a connection | Connection reference; privacy-safe reason if agreed |
| user:status | Announce a presence update | Public user reference and agreed presence state |

## Agreement Checklist

For each event, document exact payload and acknowledgement types, authorization,
recipients/rooms, error handling, rate limits, persistence order, reconnect/replay,
ordering, duplicate handling, and acceptance examples. Define disconnect and
multi-device presence behavior. Confirm block/removal privacy rules. Reserve
additional events only through joint review; no socket server is wired yet.
