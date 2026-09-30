import type { ApiResponse } from "../contracts/api.types";
import type { ChatMessage, MessageReceivedPayload, SendMessagePayload, UserStatusPayload } from "../contracts/chat.types";
import type { Connection } from "../contracts/interaction.types";
import type { Notification, NotificationReadPayload, NotificationReadResult } from "../contracts/notification.types";

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

export const SOCKET_EVENTS = {
  ...CLIENT_TO_SERVER_EVENTS,
  ...SERVER_TO_CLIENT_EVENTS,
} as const;

export interface SocketAuth {
  accessToken: string;
}

export type SocketAck<T> = (response: ApiResponse<T>) => void;

export interface ConnectionRemovedPayload {
  userId: string;
}

export interface ClientToServerEvents {
  [SOCKET_EVENTS.CHAT_SEND]: (payload: SendMessagePayload, ack: SocketAck<ChatMessage>) => void;
  [SOCKET_EVENTS.NOTIFICATION_READ]: (payload: NotificationReadPayload, ack: SocketAck<NotificationReadResult>) => void;
  [SOCKET_EVENTS.USER_ONLINE]: (payload: Record<string, never>, ack: SocketAck<UserStatusPayload>) => void;
}

export interface ServerToClientEvents {
  [SOCKET_EVENTS.CHAT_MESSAGE]: (payload: MessageReceivedPayload) => void;
  [SOCKET_EVENTS.NOTIFICATION_NEW]: (payload: Notification) => void;
  [SOCKET_EVENTS.CONNECTION_NEW]: (payload: Connection) => void;
  [SOCKET_EVENTS.CONNECTION_REMOVED]: (payload: ConnectionRemovedPayload) => void;
  [SOCKET_EVENTS.USER_STATUS]: (payload: UserStatusPayload) => void;
}