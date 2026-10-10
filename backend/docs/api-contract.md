# API and Socket Contracts

## Standard REST JSON Shapes

### Success Response
```json
{
  "status": "success",
  "data": {
    "key": "value"
  }
}
```

### Error Response
```json
{
  "status": "error",
  "message": "Human readable error message",
  "errors": [
    {
      "field": "email",
      "message": "Invalid email format"
    }
  ]
}
```

## Sample Endpoint

### POST /api/auth/register

**Request Body:**
```json
{
  "username": "johndoe",
  "email": "johndoe@example.com",
  "password": "SecurePassword123!",
  "firstName": "John",
  "lastName": "Doe"
}
```

**Success Response (201 Created):**
```json
{
  "status": "success",
  "data": {
    "user": {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "username": "johndoe",
      "email": "johndoe@example.com"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5c..."
  }
}
```

## Socket.io Event Dictionary

### Client-to-Server Events

| Event Name | Payload Example | Description |
| --- | --- | --- |
| `chat:send` | `{ "receiverId": "uuid", "content": "Hello!" }` | Sends a message to a specific user. |
| `notifications:read` | `{ "notificationIds": ["uuid-1", "uuid-2"] }` | Marks an array of notifications as read. |

### Server-to-Client Events

| Event Name | Payload Example | Description |
| --- | --- | --- |
| `presence:update` | `{ "userId": "uuid", "status": "online", "lastSeen": "2023-10-10T10:00:00Z" }` | Emitted when a user's connection status changes. |
| `notification:new` | `{ "id": "uuid", "type": "visit", "senderId": "uuid", "createdAt": "..." }` | Emitted when the user receives a new notification. |
| `chat:message` | `{ "id": "uuid", "senderId": "uuid", "content": "Hello!", "createdAt": "..." }` | Emitted when the user receives a new chat message. |
