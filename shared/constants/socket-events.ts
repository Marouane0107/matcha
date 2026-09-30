export const CLIENT_TO_SERVER_EVENTS = {
  CHAT_SEND: "chat:send",
  NOTIFICATION_READ: "notification:read",
  USER_ONLINE: "user:online",
} as const;

export const SERVER_TO_CLIENT_EVENTS = {
  CHAT_MESSAGE: "chat:message",
  NOTIFICATION_NEW: "notification:new",
  CONNECTION_NEW: "connection:new",
  CONNECTION_REMOVED: "connection:removed",
  USER_STATUS: "user:status",
} as const;