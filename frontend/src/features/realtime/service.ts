import { API_ROUTES } from "@matcha/shared";
import type { ChatMessage, ConversationPreview, Notification, NotificationReadResult, PaginatedData, PaginationQuery, ReadAllNotificationsResponse, UnreadCountResponse } from "@matcha/shared";
import { createApiClient, isRecord } from "../../services/api/client";
import { isPublicProfile } from "../profile/service";
import { isInteractionPage } from "../interactions/service";

export const isUuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const date = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value));
export function messageError(content: string) { return !content.trim() || [...content.trim()].length > 2000 ? "Enter a message of 1 to 2,000 characters." : ""; }
export const isMessage = (value: unknown): value is ChatMessage => isRecord(value) && isUuid(value.id) && isUuid(value.senderId) && isUuid(value.receiverId) && isUuid(value.clientMessageId) && typeof value.content === "string" && !messageError(value.content) && date(value.createdAt);
export const isConversation = (value: unknown): value is ConversationPreview => isRecord(value) && isPublicProfile(value.user) && value.user.isConnected && (value.lastMessage === null || isMessage(value.lastMessage)) && date(value.connectedAt);
export const isNotification = (value: unknown): value is Notification => {
  if (!isRecord(value) || !isUuid(value.id) || !["LIKE", "PROFILE_VIEW", "MESSAGE", "CONNECTION", "UNLIKE"].includes(String(value.type)) || typeof value.read !== "boolean" || !date(value.createdAt) || !isRecord(value.metadata)) return false;
  if (value.actorId === null || value.actorUsername === null) return value.actorId === null && value.actorUsername === null && Object.keys(value.metadata).length === 0;
  return isUuid(value.actorId) && typeof value.actorUsername === "string" && (value.type === "MESSAGE" ? Object.keys(value.metadata).length === 1 && isUuid(value.metadata.messageId) : Object.keys(value.metadata).length === 0);
};
export const isCount = (value: unknown): value is UnreadCountResponse => isRecord(value) && Number.isInteger(value.unreadCount) && Number(value.unreadCount) >= 0;
export const isRead = (value: unknown): value is NotificationReadResult => isCount(value) && "notificationId" in value && isUuid(value.notificationId) && "read" in value && value.read === true;
export interface RealtimeService {
  conversations(query: PaginationQuery, token: string): Promise<PaginatedData<ConversationPreview>>;
  messages(id: string, query: PaginationQuery, token: string): Promise<PaginatedData<ChatMessage>>;
  notifications(query: PaginationQuery, token: string): Promise<PaginatedData<Notification>>;
  unread(token: string): Promise<UnreadCountResponse>;
  read(id: string, token: string): Promise<NotificationReadResult>;
  readAll(token: string): Promise<ReadAllNotificationsResponse>;
}
export function createRealRealtimeService(client: ReturnType<typeof createApiClient>): RealtimeService {
  const page = <Item,>(path: string, query: PaginationQuery, accessToken: string, guard: (value: unknown) => value is Item) => {
    const params = new URLSearchParams();
    if (query.page !== undefined) params.set("page", String(query.page));
    if (query.limit !== undefined) params.set("limit", String(query.limit));
    return client.request(path, { accessToken, query: params, status: 200, validate: (value): value is PaginatedData<Item> => isInteractionPage(value, guard) });
  };
  return {
    conversations: (query, token) => page(API_ROUTES.CHAT.CONVERSATIONS, query, token, isConversation),
    messages: (id, query, token) => page(API_ROUTES.CHAT.MESSAGES.replace(":userId", encodeURIComponent(id)), query, token, isMessage),
    notifications: (query, token) => page(API_ROUTES.NOTIFICATIONS.LIST, query, token, isNotification),
    unread: accessToken => client.request(API_ROUTES.NOTIFICATIONS.UNREAD_COUNT, { accessToken, status: 200, validate: isCount }),
    read: (id, accessToken) => client.request(API_ROUTES.NOTIFICATIONS.READ.replace(":notificationId", encodeURIComponent(id)), { method: "PATCH", accessToken, status: 200, validate: isRead }),
    readAll: accessToken => client.request(API_ROUTES.NOTIFICATIONS.READ_ALL, { method: "PATCH", accessToken, status: 200, validate: (value): value is ReadAllNotificationsResponse => isCount(value) && "updatedCount" in value && Number.isInteger(value.updatedCount) && Number(value.updatedCount) >= 0 }),
  };
}
export function mergeMessages(...collections: ChatMessage[][]): ChatMessage[] {
  const messages = new Map<string, ChatMessage>();
  for (const message of collections.flat()) {
    for (const [key, existing] of messages) if (existing.id === message.id || existing.senderId === message.senderId && existing.clientMessageId === message.clientMessageId) messages.delete(key);
    messages.set(message.id, message);
  }
  return [...messages.values()].sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
}
