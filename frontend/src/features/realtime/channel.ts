import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import { ERROR_CODES, SOCKET_EVENTS } from "@matcha/shared";
import type { ApiError, ChatMessage, ClientToServerEvents, Connection, Notification, SendMessagePayload, ServerToClientEvents, SocketAuth, UserStatusPayload } from "@matcha/shared";
import { ApiRequestError, isRecord, TransportError } from "../../services/api/client";
import { isMessage, isNotification, isUuid } from "./service";
import { isConnection } from "../interactions/service";

export interface ChannelHandlers {
  connected(): void;
  disconnected(): void;
  error(error: unknown): void;
  message(message: ChatMessage): void;
  notification(notification: Notification): void;
  connection(connection: Connection): void;
  removed(id: string): void;
  presence(status: UserStatusPayload): void;
}
export interface RealtimeChannel { start(handlers: ChannelHandlers): () => void; send(payload: SendMessagePayload): Promise<ChatMessage>; reconnect(): void }
export type ChannelFactory = (token: string, userId: string) => RealtimeChannel;
const isPresence = (value: unknown): value is UserStatusPayload => isRecord(value) && isUuid(value.userId) && typeof value.isOnline === "boolean" && (value.lastSeen === null || typeof value.lastSeen === "string" && Number.isFinite(Date.parse(value.lastSeen)));
export function socketError(value: unknown): unknown {
  return isRecord(value) && typeof value.code === "string" && (Object.values(ERROR_CODES) as string[]).includes(value.code) && typeof value.message === "string"
    ? new ApiRequestError(value.code === ERROR_CODES.UNAUTHORIZED ? 401 : 403, value as unknown as ApiError) : new TransportError("malformed");
}
export function readAck<Value>(value: unknown, guard: (value: unknown) => value is Value): Value {
  if (!isRecord(value)) throw new TransportError("malformed");
  if (value.success === false && value.data === null) throw socketError(value.error);
  if (value.success !== true || value.error !== null || !guard(value.data)) throw new TransportError("malformed");
  return value.data;
}
export function createSocketChannel(url: string, token: string, factory: typeof io = io): RealtimeChannel {
  const origin = new URL(url);
  if (!["http:", "https:"].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) throw new TransportError("configuration");
  const auth: SocketAuth = { accessToken: token };
  const socket: Socket<ServerToClientEvents, ClientToServerEvents> = factory(origin.origin, { path: "/socket.io", auth, autoConnect: false, withCredentials: false });
  let current: ChannelHandlers | null = null;
  const pending = new Set<(error: unknown) => void>();
  const rejectPending = () => { for (const reject of [...pending]) reject(new TransportError("network")); };
  return {
    start(handlers) {
      current = handlers;
      const connected = () => {
        handlers.connected();
        socket.timeout(10000).emit(SOCKET_EVENTS.USER_ONLINE, {}, (error, response) => {
          if (current !== handlers) return;
          if (error) { handlers.error(new TransportError("timeout")); return; }
          try { readAck(response, isPresence); } catch (cause) { handlers.error(cause); }
        });
      };
      const disconnected = () => { rejectPending(); handlers.disconnected(); };
      const error = (cause: Error & { data?: unknown }) => { rejectPending(); handlers.error(cause.data ? socketError(cause.data) : new TransportError("network")); };
      const message = (value: unknown) => { if (isRecord(value) && isMessage(value.message)) handlers.message(value.message); else handlers.error(new TransportError("malformed")); };
      const notification = (value: unknown) => { if (isNotification(value)) handlers.notification(value); else handlers.error(new TransportError("malformed")); };
      const connection = (value: unknown) => { if (isConnection(value)) handlers.connection(value); else handlers.error(new TransportError("malformed")); };
      const removed = (value: unknown) => { if (isRecord(value) && isUuid(value.userId)) handlers.removed(value.userId); else handlers.error(new TransportError("malformed")); };
      const presence = (value: unknown) => { if (isPresence(value)) handlers.presence(value); else handlers.error(new TransportError("malformed")); };
      socket.on("connect", connected); socket.on("disconnect", disconnected); socket.on("connect_error", error);
      socket.on(SOCKET_EVENTS.CHAT_MESSAGE, message); socket.on(SOCKET_EVENTS.NOTIFICATION_NEW, notification); socket.on(SOCKET_EVENTS.CONNECTION_NEW, connection); socket.on(SOCKET_EVENTS.CONNECTION_REMOVED, removed); socket.on(SOCKET_EVENTS.USER_STATUS, presence);
      socket.connect();
      return () => {
        current = null; rejectPending();
        socket.off("connect", connected); socket.off("disconnect", disconnected); socket.off("connect_error", error);
        socket.off(SOCKET_EVENTS.CHAT_MESSAGE, message); socket.off(SOCKET_EVENTS.NOTIFICATION_NEW, notification); socket.off(SOCKET_EVENTS.CONNECTION_NEW, connection); socket.off(SOCKET_EVENTS.CONNECTION_REMOVED, removed); socket.off(SOCKET_EVENTS.USER_STATUS, presence);
        socket.disconnect();
      };
    },
    reconnect: () => { if (current) { socket.disconnect(); socket.connect(); } },
    send(payload) {
      if (!socket.connected || !current) return Promise.reject(new TransportError("network"));
      return new Promise((resolve, reject) => {
        const fail = (error: unknown) => { pending.delete(fail); reject(error); };
        pending.add(fail);
        socket.timeout(10000).emit(SOCKET_EVENTS.CHAT_SEND, payload, (error, response) => {
          if (!pending.delete(fail)) return;
          if (error) { reject(new TransportError("timeout")); return; }
          try { resolve(readAck(response, isMessage)); } catch (cause) { reject(cause); }
        });
      });
    },
  };
}
