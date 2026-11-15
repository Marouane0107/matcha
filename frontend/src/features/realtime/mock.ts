import { ERROR_CODES } from "@matcha/shared";
import type { ChatMessage, Notification, PaginatedData, PaginationQuery, SendMessagePayload } from "@matcha/shared";
import { ApiRequestError, TransportError } from "../../services/api/client";
import type { ProfileService } from "../profile/service";
import type { InteractionService } from "../interactions/service";
import type { RealtimeBundle } from "./RealtimeProvider";
import type { ChannelHandlers } from "./channel";
import { messageError } from "./service";

export function createMockRealtimeBundle(profiles: ProfileService, interactions: InteractionService, scenario = "populated", delay = 150): RealtimeBundle {
  const ownerId = "00000000-0000-4000-8000-000000000001";
  const noorId = "00000000-0000-4000-8000-000000000003";
  const messages: ChatMessage[] = scenario === "empty" ? [] : [{ id: "30000000-0000-4000-8000-000000000001", senderId: noorId, receiverId: ownerId, clientMessageId: "40000000-0000-4000-8000-000000000001", content: "Hello! This is a synthetic conversation for reviewing Matcha.", createdAt: "2026-11-15T12:00:00.000Z" }];
  let notifications: Notification[] = scenario === "empty" ? [] : (["LIKE", "PROFILE_VIEW", "MESSAGE", "CONNECTION", "UNLIKE"] as const).map((type, index) => ({ id: `50000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, type, actorId: noorId, actorUsername: "noor_demo", read: index > 2, createdAt: `2026-11-15T11:0${5 - index}:00.000Z`, metadata: type === "MESSAGE" ? { messageId: messages[0].id } : {} }));
  const subscribers = new Set<ChannelHandlers>();
  const replies = new Set<string>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const fail = (code: keyof typeof ERROR_CODES, status = 403): never => { throw new ApiRequestError(status, { code: ERROR_CODES[code], message: code }); };
  async function wait(token: string) {
    await new Promise(resolve => setTimeout(resolve, delay));
    if (!token || scenario === "unauthorized") fail("UNAUTHORIZED", 401);
    if (scenario === "network") throw new TransportError("network");
    if (scenario === "api") fail("INTERNAL_ERROR", 500);
  }
  async function connected(id: string, token: string) {
    if (scenario === "blocked") fail("USER_BLOCKED");
    if (scenario === "disconnected") fail("NOT_CONNECTED");
    const connections = await interactions.connections({ page: 1, limit: 100 }, token);
    if (!connections.items.some(item => item.user.id === id)) fail("NOT_CONNECTED");
  }
  const page = <Item,>(items: Item[], query: PaginationQuery): PaginatedData<Item> => {
    const current = query.page ?? 1; const limit = query.limit ?? 20;
    return structuredClone({ items: items.slice((current - 1) * limit, current * limit), pagination: { page: current, limit, total: items.length, totalPages: Math.ceil(items.length / limit) } });
  };
  const visibleNotifications = async (token: string) => {
    const visible: Notification[] = [];
    for (const item of notifications) {
      try { if (item.actorUsername) await profiles.publicProfile(item.actorUsername, token); visible.push(item); }
      catch (error) { if (!(error instanceof ApiRequestError && error.error.code === ERROR_CODES.PROFILE_NOT_FOUND)) throw error; }
    }
    return visible;
  };
  const unread = async (token: string) => (await visibleNotifications(token)).filter(item => !item.read).length;
  function later(action: () => void) { const timer = setTimeout(() => { timers.delete(timer); action(); }, delay); timers.add(timer); }
  return {
    service: {
      async conversations(query, token) {
        await wait(token);
        if (scenario === "empty") return page([], query);
        const result = await interactions.connections({ page: 1, limit: 100 }, token);
        const previews = result.items.map(item => ({ user: item.user, connectedAt: item.connectedAt, lastMessage: messages.filter(message => message.senderId === item.user.id || message.receiverId === item.user.id).at(-1) ?? null }));
        previews.sort((left, right) => (right.lastMessage?.createdAt ?? right.connectedAt).localeCompare(left.lastMessage?.createdAt ?? left.connectedAt) || right.user.id.localeCompare(left.user.id));
        return page(previews, query);
      },
      async messages(id, query, token) { await wait(token); await connected(id, token); return page(messages.filter(message => message.senderId === id || message.receiverId === id).slice().sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id)), query); },
      async notifications(query, token) { await wait(token); return page(await visibleNotifications(token), query); },
      async unread(token) { await wait(token); return { unreadCount: await unread(token) }; },
      async read(id, token) {
        await wait(token); const item = (await visibleNotifications(token)).find(item => item.id === id);
        if (!item) return fail("NOT_FOUND", 404);
        item.read = true; notifications = notifications.map(value => value.id === id ? item : value);
        return { notificationId: id, read: true, unreadCount: await unread(token) };
      },
      async readAll(token) { await wait(token); const visible = await visibleNotifications(token); const ids = new Set(visible.map(item => item.id)); const updatedCount = visible.filter(item => !item.read).length; notifications = notifications.map(item => ids.has(item.id) ? { ...item, read: true } : item); return { updatedCount, unreadCount: await unread(token) }; },
    },
    channel: (token, userId) => {
      let handler: ChannelHandlers | null = null;
      let online = false;
      return {
        start(handlers) {
          handler = handlers; subscribers.add(handlers);
          later(() => { if (handler !== handlers) return; if (scenario === "unauthorized") handlers.error(new ApiRequestError(401, { code: ERROR_CODES.UNAUTHORIZED, message: "Expired" })); else if (scenario === "network") handlers.error(new TransportError("network")); else { online = true; handlers.connected(); } });
          return () => { online = false; handler = null; subscribers.delete(handlers); if (!subscribers.size) { timers.forEach(clearTimeout); timers.clear(); } };
        },
        reconnect() { if (handler) { online = true; handler.connected(); } },
        async send(payload: SendMessagePayload) {
          await wait(token);
          if (!online) throw new TransportError("network");
          await connected(payload.receiverId, token);
          if (payload.receiverId === userId) fail("MESSAGE_NOT_ALLOWED");
          if (messageError(payload.content)) fail("VALIDATION_ERROR", 422);
          const existing = messages.find(message => message.senderId === userId && message.clientMessageId === payload.clientMessageId);
          if (existing && (existing.content !== payload.content || existing.receiverId !== payload.receiverId)) fail("VALIDATION_ERROR", 422);
          const sent: ChatMessage = existing ?? { id: crypto.randomUUID(), senderId: userId, receiverId: payload.receiverId, clientMessageId: payload.clientMessageId, content: payload.content, createdAt: new Date().toISOString() };
          if (!existing) messages.push(sent);
          subscribers.forEach(listener => listener.message(structuredClone(sent)));
          if (!replies.has(sent.id)) {
            replies.add(sent.id);
            later(() => { void (async () => {
              try {
                await connected(payload.receiverId, token);
                if (!subscribers.size) return;
                const reply: ChatMessage = { id: crypto.randomUUID(), senderId: payload.receiverId, receiverId: userId, clientMessageId: crypto.randomUUID(), content: "Synthetic reply received. Thanks for your message!", createdAt: new Date().toISOString() };
                messages.push(reply);
                const notice: Notification = { id: crypto.randomUUID(), type: "MESSAGE", actorId: payload.receiverId, actorUsername: (await interactions.connections({ limit: 100 }, token)).items.find(item => item.user.id === payload.receiverId)?.user.username ?? null, read: false, createdAt: reply.createdAt, metadata: { messageId: reply.id } };
                if (!notice.actorUsername) return;
                notifications.unshift(notice);
                subscribers.forEach(listener => { listener.message(structuredClone(reply)); listener.notification(structuredClone(notice)); });
              } catch { subscribers.forEach(listener => listener.removed(payload.receiverId)); }
            })(); });
          }
          if (scenario === "timeout" && !existing) throw new TransportError("timeout");
          return structuredClone(sent);
        },
      };
    },
  };
}
