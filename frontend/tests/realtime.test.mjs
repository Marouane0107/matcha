import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createElement, StrictMode, act } from "react";
import { build } from "esbuild";
import { SOCKET_EVENTS } from "@matcha/shared";
import { createApiClient, ApiRequestError, TransportError } from "../src/services/api/client.ts";
import { createRealRealtimeService, isMessage, isNotification, mergeMessages, messageError } from "../src/features/realtime/service.ts";
import { createSocketChannel, readAck } from "../src/features/realtime/channel.ts";
import { createMockRealtimeBundle } from "../src/features/realtime/mock.ts";
import { createMockProfileService } from "../src/features/profile/mock.ts";
import { createMockInteractionBundle } from "../src/features/interactions/mock.ts";
import { createAuthSession } from "../src/features/auth/session.ts";

const owner = "00000000-0000-4000-8000-000000000001";
const peer = "00000000-0000-4000-8000-000000000003";
const token = "synthetic-realtime-token";
const message = (index = 1, content = "Synthetic message", outgoing = false) => ({ id: `30000000-0000-4000-8000-${String(index).padStart(12, "0")}`, clientMessageId: `40000000-0000-4000-8000-${String(index).padStart(12, "0")}`, senderId: outgoing ? owner : peer, receiverId: outgoing ? peer : owner, content, createdAt: `2026-11-15T12:00:${String(index).padStart(2, "0")}.000Z` });
const notification = (index = 1, type = "MESSAGE") => ({ id: `50000000-0000-4000-8000-${String(index).padStart(12, "0")}`, type, actorId: peer, actorUsername: "noor_demo", read: false, createdAt: `2026-11-15T12:01:${String(index).padStart(2, "0")}.000Z`, metadata: type === "MESSAGE" ? { messageId: message(index).id } : {} });
const page = (items, current = 1, totalPages = 1) => ({ items, pagination: { page: current, limit: 20, total: items.length, totalPages } });
const ack = data => ({ success: true, data, error: null });
const failure = code => new ApiRequestError(403, { code, message: code });
const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost/messages" });
globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import("react-dom/client");
const { createMemoryRouter, RouterProvider, Navigate } = await import("react-router-dom");
const { AuthProvider, useAuth } = await import("../src/features/auth/AuthProvider.tsx");
const { ProfileProvider } = await import("../src/features/profile/ProfileProvider.tsx");
const { InteractionProvider, useInteractions } = await import("../src/features/interactions/InteractionProvider.tsx");
const { RealtimeProvider, useRealtime } = await import("../src/features/realtime/RealtimeProvider.tsx");
const { default: ChatPage } = await import("../src/pages/ChatPage.tsx");
const { default: NotificationsPage } = await import("../src/pages/NotificationsPage.tsx");
const flush = () => new Promise(resolve => setTimeout(resolve, 15));
const settle = () => act(async () => { await flush(); await flush(); });
const text = () => document.body.textContent;
const button = label => [...document.querySelectorAll("button")].find(element => element.textContent === label);
const click = async element => { assert(element, text()); await act(async () => { element.click(); await flush(); }); };
const fill = value => act(async () => { const field = document.querySelector("#message-content"); Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set.call(field, value); field.dispatchEvent(new window.Event("input", { bubbles: true })); });

async function harness(context, initial = `/messages/${peer}`, options = {}) {
  const profiles = createMockProfileService(0);
  const interactions = createMockInteractionBundle(profiles, "eligible", 0);
  const publicPeer = await interactions.profiles.publicProfile("noor_demo", token);
  const notices = options.notifications ?? [notification()];
  const counters = { conversations: 0, messages: 0, notifications: 0, unread: 0, started: 0, disposed: 0, sent: [], tokens: [] };
  let handlers; let online = false;
  const listeners = new Set();
  const bundle = {
    service: {
      async conversations() { counters.conversations++; return page([{ user: publicPeer, lastMessage: message(), connectedAt: "2026-11-01T00:00:00Z" }]); },
      async messages(id, query) { counters.messages++; if (id !== peer) throw failure("NOT_CONNECTED"); return query.page === 2 ? page([message(1, "Older history")], 2, 2) : page([message(3, "Latest history"), message(2, "Middle history")], 1, options.older ? 2 : 1); },
      async notifications() { counters.notifications++; return page(structuredClone(notices)); },
      async unread() { counters.unread++; return { unreadCount: notices.filter(item => !item.read).length }; },
      async read(id) { const item = notices.find(item => item.id === id); item.read = true; return { notificationId: id, read: true, unreadCount: notices.filter(item => !item.read).length }; },
      async readAll() { const updatedCount = notices.filter(item => !item.read).length; notices.forEach(item => { item.read = true; }); return { updatedCount, unreadCount: 0 }; },
      ...options.service,
    },
    channel: (accessToken, userId) => {
      counters.tokens.push({ accessToken, userId });
      return {
        start(value) { handlers = value; listeners.add(value); counters.started++; online = true; value.connected(); return () => { listeners.delete(value); counters.disposed++; online = false; }; },
        reconnect() { online = true; handlers.connected(); },
        async send(payload) { counters.sent.push(payload); if (!online) throw new TransportError("network"); return options.send ? options.send(payload, handlers) : { ...message(10, payload.content, true), clientMessageId: payload.clientMessageId }; },
      };
    },
  };
  const auth = { async me() { return { id: owner, username: "demo", email: "synthetic@example.invalid", firstName: "Alex", lastName: "Demo", emailVerified: true, profileComplete: true }; } };
  const session = createAuthSession(auth);
  session.setSession({ accessToken: token, expiresIn: 900, tokenType: "Bearer", user: await auth.me() });
  let runtime; let interactionState;
  function Probe() { runtime = useRealtime(); interactionState = useInteractions(); return null; }
  function AuthContent() { const state = useAuth(); return state.accessToken ? createElement(RealtimeProvider, { bundle }, createElement(Probe), createElement(RouterProvider, { router })) : createElement("p", null, "Logged out"); }
  const router = createMemoryRouter([
    { path: "/messages", element: createElement(ChatPage) }, { path: "/messages/:userId", element: createElement(ChatPage) },
    { path: "/notifications", element: createElement(NotificationsPage) }, { path: "*", element: createElement(Navigate, { to: "/messages" }) },
  ], { initialEntries: [initial] });
  const root = createRoot(document.getElementById("root"));
  await act(async () => root.render(createElement(StrictMode, null, createElement(AuthProvider, { session, service: auth }, createElement(ProfileProvider, { service: interactions.profiles }, createElement(InteractionProvider, { service: interactions.service }, createElement(AuthContent)))))));
  await settle();
  context.after(async () => { await act(async () => { root.unmount(); session.clearSession(); }); router.dispose(); });
  return { router, session, counters, bundle, listeners, notices, event: callback => act(async () => { callback(handlers); await flush(); }), runtime: () => runtime, interactions: () => interactionState };
}

test("REST adapter uses canonical authenticated paginated routes and read PATCH actions", async () => {
  const peerProfile = await createMockInteractionBundle(createMockProfileService(0), "eligible", 0).profiles.publicProfile("noor_demo", token);
  const calls = [];
  const service = createRealRealtimeService(createApiClient("https://api.example.invalid/api", undefined, async (url, options) => {
    calls.push({ url, options });
    const data = url.pathname.endsWith("/unread-count") ? { unreadCount: 1 } : url.pathname.endsWith("/read-all") ? { updatedCount: 1, unreadCount: 0 } : url.pathname.endsWith("/read") ? { notificationId: notification().id, read: true, unreadCount: 0 } : url.pathname.endsWith("/messages") ? page([message()]) : url.pathname.endsWith("/notifications") ? page([notification()]) : page([{ user: peerProfile, lastMessage: null, connectedAt: "2026-11-01T00:00:00Z" }]);
    return new Response(JSON.stringify(ack(data)), { headers: { "Content-Type": "application/json" } });
  }));
  await service.conversations({ page: 2, limit: 20 }, token); await service.messages(peer, { page: 1 }, token); await service.notifications({}, token); await service.unread(token); await service.read(notification().id, token); await service.readAll(token);
  assert.deepEqual(calls.map(call => call.url.pathname), ["/api/conversations", `/api/conversations/${peer}/messages`, "/api/notifications", "/api/notifications/unread-count", `/api/notifications/${notification().id}/read`, "/api/notifications/read-all"]);
  assert.equal(calls[0].url.searchParams.get("page"), "2");
  assert(calls.every(call => call.options.headers.get("Authorization") === `Bearer ${token}` && call.options.credentials === "omit"));
  assert.equal(calls[4].options.method, "PATCH"); assert.equal(calls[5].options.method, "PATCH");
});

test("message/notification guards, ack errors and merge reject malformed data and deduplicate identities", () => {
  assert(isMessage(message())); assert(!isMessage({ ...message(), clientMessageId: "bad" }));
  assert(messageError(" ")); assert(messageError("x".repeat(2001))); assert.equal(messageError("hello"), "");
  assert(isNotification(notification())); assert(!isNotification({ ...notification(), type: "TYPING" }));
  assert(!isNotification({ ...notification(), metadata: { latitude: 33 } }));
  assert(isNotification({ ...notification(), actorId: null, actorUsername: null, metadata: {} }));
  assert.deepEqual(readAck(ack(message()), isMessage), message());
  assert.throws(() => readAck({ success: false, data: null, error: { code: "NOT_CONNECTED", message: "No" } }, isMessage), error => error.error.code === "NOT_CONNECTED");
  assert.throws(() => readAck(ack({}), isMessage), error => error.kind === "malformed");
  const updated = { ...message(), id: message(2).id };
  assert.equal(mergeMessages([message()], [updated], [updated]).length, 1);
});

test("real socket handshake, documented events, ten-second ack timeout and cleanup use no cookies/query token", async () => {
  const handlers = new Map(); const emissions = []; let configuration; let disconnected = 0; let connected = 0; let ackSend;
  const socket = {
    connected: true, on(event, handler) { handlers.set(event, handler); return this; }, off(event, handler) { assert.equal(handlers.get(event), handler); handlers.delete(event); return this; },
    connect() { connected++; return this; }, disconnect() { disconnected++; return this; }, timeout(value) { assert.equal(value, 10000); return this; },
    emit(event, payload, callback) { emissions.push({ event, payload }); if (event === SOCKET_EVENTS.USER_ONLINE) callback(null, ack({ userId: owner, isOnline: true, lastSeen: null })); else ackSend = callback; },
  };
  const channel = createSocketChannel("https://socket.example.invalid", token, (url, options) => { configuration = { url, options }; return socket; });
  const events = [];
  const cleanup = channel.start({ connected: () => events.push("connected"), disconnected() {}, error: error => events.push(error), message: value => events.push(value), notification() {}, connection() {}, removed() {}, presence() {} });
  assert.deepEqual(configuration.options.auth, { accessToken: token }); assert.equal(configuration.options.path, "/socket.io"); assert.equal(configuration.options.autoConnect, false); assert(!configuration.options.query);
  assert.equal(configuration.options.withCredentials, false);
  handlers.get("connect")(); assert.equal(emissions[0].event, "user:online"); assert.deepEqual(emissions[0].payload, {});
  const payload = { receiverId: peer, clientMessageId: message().clientMessageId, content: "Hello" };
  const sending = channel.send(payload); assert.equal(emissions[1].event, "chat:send"); assert.deepEqual(emissions[1].payload, payload);
  ackSend(null, ack({ ...message(), content: "Hello" })); await sending;
  handlers.get("chat:message")({ message: message() }); assert(events.some(value => value?.id === message().id));
  const timeout = channel.send(payload); ackSend(new Error("timeout")); await assert.rejects(timeout, error => error.kind === "timeout");
  handlers.get("user:status")(null); assert(events.some(value => value?.kind === "malformed"));
  channel.reconnect(); assert.equal(connected, 2); assert.equal(disconnected, 1);
  const pending = channel.send(payload); cleanup(); await assert.rejects(pending, error => error.kind === "network");
  assert.equal(handlers.size, 0); assert.equal(disconnected, 2);
  channel.reconnect(); assert.equal(connected, 2);
});

test("chat history displays chronological pages and merges duplicate incoming/ack delivery safely", async context => {
  const current = await harness(context, `/messages/${peer}`, { older: true, send: async (payload, handlers) => { const sent = { ...message(10, payload.content, true), clientMessageId: payload.clientMessageId }; handlers.message(sent); handlers.message(sent); return sent; } });
  assert(text().includes("Middle history"));
  await click(button("Load older messages"));
  assert.deepEqual([...document.querySelectorAll(".message-list p")].map(element => element.textContent), ["Older history", "Middle history", "Latest history"]);
  await fill("  Hello <script>not HTML</script>  "); await click(button("Send message"));
  assert.equal(current.counters.sent.length, 1);
  assert.equal(document.querySelectorAll(".message-list li").length, 4);
  assert.equal(document.querySelectorAll("script").length, 0);
  assert.equal(current.counters.sent[0].content, "Hello <script>not HTML</script>");
  assert(!("senderId" in current.counters.sent[0]));
  await current.event(handlers => { handlers.message(message(11, "Live incoming")); handlers.message(message(11, "Live incoming")); });
  assert.equal([...document.querySelectorAll(".message-list p")].filter(element => element.textContent === "Live incoming").length, 1);
});

test("failed send retries the same clientMessageId/content and locks duplicate sends", async context => {
  let finish; let calls = 0;
  const current = await harness(context, `/messages/${peer}`, { send: payload => ++calls === 1 ? Promise.reject(new TransportError("timeout")) : new Promise(resolve => { finish = () => resolve({ ...message(10, payload.content, true), clientMessageId: payload.clientMessageId }); }) });
  await fill("Retry once"); await click(button("Send message"));
  assert(button("Retry message")); assert(document.querySelector("#message-content").disabled);
  await act(async () => { button("Retry message").click(); button("Retry message").click(); });
  assert.equal(current.counters.sent.length, 2);
  assert.deepEqual(current.counters.sent[0], current.counters.sent[1]);
  await act(async () => finish());
  assert(!button("Retry message")); assert.equal(document.querySelector("#message-content").value, "");
});

test("disconnect disables sends and reconnect refetches conversations/history/notifications/count without clearing auth", async context => {
  const current = await harness(context);
  const previous = { ...current.counters };
  await current.event(handlers => handlers.disconnected());
  assert(button("Send message").disabled); assert(current.session.getSnapshot().accessToken);
  await click(button("Reconnect")); await settle();
  assert(current.counters.messages > previous.messages); assert(current.counters.conversations > previous.conversations); assert(current.counters.unread > previous.unread);
  assert.equal(current.session.getSnapshot().accessToken, token);
});

test("connection removal immediately hides history, stops sending, and preserves UNLIKE notification delivery", async context => {
  const current = await harness(context);
  await current.event(handlers => handlers.removed(peer));
  assert(text().includes("Conversation unavailable")); assert(!text().includes("Middle history")); assert(!button("Send message"));
  await assert.rejects(current.runtime().send({ receiverId: peer, clientMessageId: message().clientMessageId, content: "No" }), error => error.error.code === "NOT_CONNECTED");
  const notice = notification(2, "UNLIKE"); current.notices.unshift(notice);
  await current.event(handlers => { handlers.notification(notice); handlers.notification(notice); });
  await act(async () => current.router.navigate("/notifications")); await settle();
  assert(text().includes("removed a like"));
  assert.equal([...document.querySelectorAll(".notification-list li")].filter(element => element.textContent.includes("removed a like")).length, 1);
});

test("history access denial and send denial clear sensitive history and disable further sends", async context => {
  const current = await harness(context, `/messages/${peer}`, { send: async () => { throw failure("USER_BLOCKED"); } });
  await fill("Cannot send"); await click(button("Send message"));
  assert(text().includes("Conversation unavailable")); assert(!text().includes("Middle history"));
  await act(async () => current.router.navigate(`/messages/${owner.slice(0, -1)}2`)); await settle();
  assert(text().includes("Conversation unavailable"));
});

test("StrictMode listener cleanup, logout and socket auth failures invalidate only the active memory session", async context => {
  const current = await harness(context, "/messages");
  assert.equal(current.listeners.size, 1); assert.equal(current.counters.started - current.counters.disposed, 1);
  assert(current.counters.tokens.every(value => value.accessToken === token && value.userId === owner));
  await current.event(handlers => handlers.error(failure("UNAUTHORIZED")));
  assert.equal(current.session.getSnapshot().accessToken, null); assert.equal(current.listeners.size, 0); assert(text().includes("Logged out"));
});

test("notification history/read/read-all respect server counts, deleted actors and safe targets", async context => {
  const deleted = { ...notification(3, "LIKE"), actorId: null, actorUsername: null, metadata: {} };
  const current = await harness(context, "/notifications", { notifications: [notification(), notification(2, "PROFILE_VIEW"), deleted] });
  assert(text().includes("3 unread")); assert(text().includes("Deleted account"));
  assert(document.querySelector(`a[href="/messages/${peer}"]`)); assert(document.querySelector('a[href="/profiles/noor_demo"]'));
  await click([...document.querySelectorAll(".notification-list button")][0]); await settle();
  assert(text().includes("2 unread"));
  await click(button("Mark all as read")); await settle();
  assert(text().includes("0 unread")); assert(current.notices.every(value => value.read));
});

test("notification events update history/count once, and focus refetches missed state", async context => {
  const current = await harness(context, "/notifications");
  const incoming = notification(2, "LIKE"); current.notices.unshift(incoming);
  await current.event(handlers => { handlers.notification(incoming); handlers.notification(incoming); });
  assert(text().includes("2 unread")); assert.equal(document.querySelectorAll(".notification-list li").length, 2);
  const before = current.counters.notifications;
  await act(async () => window.dispatchEvent(new window.Event("focus"))); await settle();
  assert(current.counters.notifications > before);
});

test("local block clears cached history and suppresses blocked notifications before refetch", async context => {
  const current = await harness(context);
  await act(async () => current.interactions().rememberBlock(peer, "noor_demo")); await settle();
  assert(text().includes("Conversation unavailable")); assert(!text().includes("Middle history"));
  await current.event(handlers => handlers.connection({ user: { id: peer }, connectedAt: "2026-11-15T12:00:00Z" }));
  assert(text().includes("Conversation unavailable"));
  await current.event(handlers => handlers.message(message(12, "Must remain hidden")));
  assert(!text().includes("Must remain hidden"));
  await act(async () => current.router.navigate("/notifications")); await settle();
  assert.equal(document.querySelectorAll(".notification-list li").length, 0);
});

test("connection:new restores access only after REST history reauthorization", async context => {
  const current = await harness(context);
  await current.event(handlers => handlers.removed(peer)); assert(text().includes("Conversation unavailable"));
  const publicPeer = await createMockInteractionBundle(createMockProfileService(0), "eligible", 0).profiles.publicProfile("noor_demo", token);
  await current.event(handlers => handlers.connection({ user: publicPeer, connectedAt: "2026-11-15T12:00:00Z" })); await settle();
  assert(text().includes("Middle history")); assert(!button("Send message").disabled);
});

test("REST recovery resolves an uncertain send without resending or changing identity", async context => {
  let sent;
  const current = await harness(context, `/messages/${peer}`, { send: async payload => { sent = { ...message(10, payload.content, true), clientMessageId: payload.clientMessageId }; throw new TransportError("timeout"); } });
  await fill("Recover this send"); await click(button("Send message")); assert(button("Retry message"));
  current.bundle.service.messages = async () => page([sent]);
  await current.event(handlers => handlers.disconnected()); await click(button("Reconnect")); await settle();
  assert(!button("Retry message")); assert.equal(current.counters.sent.length, 1); assert.equal(document.querySelector("#message-content").value, "");
  assert(text().includes("Recover this send"));
});

test("notification pagination uses returned metadata and read failures remain retryable", async context => {
  const current = await harness(context, "/notifications", { service: { async notifications(query) { return page([notification(query.page === 2 ? 2 : 1, "LIKE")], query.page ?? 1, 2); }, async read() { throw new TransportError("network"); } } });
  await click(button("Next notifications")); assert(text().includes("Page 2 of 2")); assert(button("Next notifications").disabled);
  await click(document.querySelector(".notification-list button")); assert(text().includes("Couldn't reach Matcha"));
  assert(document.querySelector(".notification-list button"));
  await click(button("Previous notifications")); assert(text().includes("Page 1 of 2"));
});

test("explicit logout disposes the socket and drops all realtime state", async context => {
  const current = await harness(context);
  await current.event(handlers => handlers.message(message(12, "Private cached message")));
  await act(async () => current.session.clearSession());
  assert.equal(current.listeners.size, 0); assert.equal(current.counters.started, current.counters.disposed);
  assert.equal(text(), "Logged out");
});

test("API failures offer history/notification retry and malformed notification payloads are rejected", async context => {
  let failures = true;
  const current = await harness(context, `/messages/${peer}`, { service: { async messages() { if (failures) throw new TransportError("network"); return page([]); } } });
  assert(button("Retry history")); failures = false; await click(button("Retry history")); assert(text().includes("No messages yet."));
  current.bundle.service.notifications = async () => { throw new TransportError("network"); };
  await act(async () => current.router.navigate("/notifications")); await settle(); assert(button("Retry notifications"));
});

test("development bundle enforces mutual eligibility, duplicate retry and block/unlike restrictions", async () => {
  const interactions = createMockInteractionBundle(createMockProfileService(0), "eligible", 0);
  const bundle = createMockRealtimeBundle(interactions.profiles, interactions.service, "populated", 0);
  const events = []; const transport = bundle.channel(token, owner);
  const stop = transport.start({ connected() {}, disconnected() {}, error() {}, message: value => events.push(value), notification() {}, connection() {}, removed() {}, presence() {} });
  await flush();
  assert.equal((await bundle.service.conversations({}, token)).items.length, 1);
  const payload = { receiverId: peer, clientMessageId: crypto.randomUUID(), content: "Synthetic outgoing" };
  const first = await transport.send(payload); const retry = await transport.send(payload); assert.equal(first.id, retry.id);
  await assert.rejects(transport.send({ ...payload, content: "Changed" }), error => error.error.code === "VALIDATION_ERROR");
  await interactions.service.unlike(peer, token);
  await assert.rejects(bundle.service.messages(peer, {}, token), error => error.error.code === "NOT_CONNECTED");
  await assert.rejects(transport.send({ ...payload, clientMessageId: crypto.randomUUID() }), error => error.error.code === "NOT_CONNECTED");
  await interactions.service.block(peer, token);
  assert.equal((await bundle.service.notifications({}, token)).items.length, 0);
  stop();
});

test("mock failure scenarios are explicit and production compilation excludes realtime fixtures", async () => {
  const interactions = createMockInteractionBundle(createMockProfileService(0), "eligible", 0);
  for (const [scenario, code] of [["blocked", "USER_BLOCKED"], ["disconnected", "NOT_CONNECTED"], ["unauthorized", "UNAUTHORIZED"], ["api", "INTERNAL_ERROR"]]) await assert.rejects(createMockRealtimeBundle(interactions.profiles, interactions.service, scenario, 0).service.messages(peer, {}, token), error => error.error.code === code);
  await assert.rejects(createMockRealtimeBundle(interactions.profiles, interactions.service, "network", 0).service.unread(token), error => error.kind === "network");
  const output = await build({ entryPoints: [new URL("../src/features/realtime/RealtimeProvider.tsx", import.meta.url).pathname], write: false, bundle: true, minify: true, format: "esm", platform: "browser", define: { "import.meta.env.DEV": "false", "import.meta.env.VITE_REALTIME_MOCK": '"true"', "import.meta.env.VITE_PROFILE_MOCK": '"true"', "import.meta.env.VITE_INTERACTIONS_MOCK": '"true"', "import.meta.env.VITE_API_URL": '"http://localhost:3000/api"', "import.meta.env.VITE_SOCKET_URL": '"http://localhost:3000"' } });
  assert(!output.outputFiles[0].text.includes("Synthetic reply received")); assert(!output.outputFiles[0].text.includes("noor_demo"));
});
