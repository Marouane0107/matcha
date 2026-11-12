import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createElement, StrictMode, act } from "react";
import { build } from "esbuild";
import { createApiClient, ApiRequestError } from "../src/services/api/client.ts";
import { createRealInteractionService, isInteractionPage, isLike, isLikeStatus } from "../src/features/interactions/service.ts";
import { createMockInteractionBundle } from "../src/features/interactions/mock.ts";
import { createMockProfileService } from "../src/features/profile/mock.ts";

const token = "synthetic-interaction-token";
const samId = "00000000-0000-4000-8000-000000000002";
const ownerId = "00000000-0000-4000-8000-000000000001";
const bundle = (scenario = "eligible") => createMockInteractionBundle(createMockProfileService(0), scenario, 0);
const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost/profiles/sam_demo" });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import("react-dom/client");
const { createMemoryRouter, RouterProvider } = await import("react-router-dom");
const { AuthProvider } = await import("../src/features/auth/AuthProvider.tsx");
const { ProfileProvider } = await import("../src/features/profile/ProfileProvider.tsx");
const { InteractionProvider } = await import("../src/features/interactions/InteractionProvider.tsx");
const { default: PublicProfilePage } = await import("../src/pages/PublicProfilePage.tsx");
const { default: RelationshipsPage } = await import("../src/pages/RelationshipsPage.tsx");
const snapshot = { accessToken: token, user: { id: ownerId, username: "demo" } };
const session = { subscribe: () => () => {}, getSnapshot: () => snapshot, expireIfNeeded() {} };
const flush = () => new Promise(resolve => setTimeout(resolve, 20));
const settle = async () => act(async () => { await flush(); await flush(); });
const text = () => document.body.textContent;
const button = label => [...document.querySelectorAll("button")].find(element => element.textContent === label);
const click = element => act(async () => { assert(element); element.click(); await flush(); });
const details = value => act(async () => {
  const element = document.querySelector("#report-details");
  Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set.call(element, value);
  element.dispatchEvent(new window.Event("input", { bubbles: true }));
});

async function mount(context, current = bundle(), initial = "/profiles/sam_demo") {
  const router = createMemoryRouter([
    { path: "/profiles/:username", element: createElement(PublicProfilePage) },
    ...["likes", "views", "connections"].map(kind => ({ path: `/interactions/${kind}`, element: createElement(RelationshipsPage, { key: kind, kind }) })),
  ], { initialEntries: [initial] });
  const root = createRoot(document.getElementById("root"));
  await act(async () => root.render(createElement(StrictMode, null, createElement(AuthProvider, { session, service: {} }, createElement(ProfileProvider, { service: current.profiles }, createElement(InteractionProvider, { service: current.service }, createElement(RouterProvider, { router })))))));
  await settle();
  context.after(async () => { await act(async () => root.unmount()); router.dispose(); });
  return router;
}

test("like/unlike transitions are authoritative and block/unblock never restores removed relationships", async () => {
  const current = bundle();
  assert.deepEqual(await current.service.like(samId, token), { likedByMe: true, hasLikedMe: true, isConnected: true });
  await assert.rejects(current.service.like(samId, token), error => error.error.code === "ALREADY_LIKED");
  assert((await current.service.connections({}, token)).items.some(item => item.user.id === samId));
  const unliked = await current.service.unlike(samId, token);
  assert.equal(unliked.isConnected, false);
  assert.equal(unliked.hasLikedMe, true);
  await current.service.like(samId, token);
  await current.service.block(samId, token);
  await current.service.block(samId, token);
  await assert.rejects(current.profiles.publicProfile("sam_demo", token), error => error.error.code === "PROFILE_NOT_FOUND");
  await assert.rejects(current.service.like(samId, token), error => error.error.code === "USER_BLOCKED");
  for (const [kind, field] of [["likes", "actor"], ["views", "viewer"], ["connections", "user"]]) assert(!(await current.service[kind]({}, token)).items.some(item => item[field].id === samId));
  await current.service.unblock(samId, token);
  await current.service.unblock(samId, token);
  const profile = await current.profiles.publicProfile("sam_demo", token);
  assert.equal(profile.hasLikedMe, false);
  assert.equal(profile.likedByMe, false);
  assert.equal(profile.isConnected, false);
});

test("eligibility, self, missing-like and backend failure scenarios use shared errors", async () => {
  for (const [scenario, code] of [["incomplete", "PROFILE_INCOMPLETE"], ["no_picture", "PROFILE_PICTURE_REQUIRED"], ["blocked", "USER_BLOCKED"], ["api", "INTERNAL_ERROR"]]) await assert.rejects(bundle(scenario).service.like(samId, token), error => error.error.code === code);
  await assert.rejects(bundle("network").service.like(samId, token), error => error.kind === "network");
  await assert.rejects(bundle().service.like(ownerId, token), error => error.error.code === "CANNOT_LIKE_SELF");
  await assert.rejects(bundle().service.visit(ownerId, token), error => error.error.code === "VALIDATION_ERROR");
  await assert.rejects(bundle().service.unlike(samId, token), error => error.error.code === "LIKE_NOT_FOUND");
  await assert.rejects(bundle().service.like(samId, ""), error => error.status === 401);
});

test("reporting validates trimmed details and does not block or change likes, including other-direction blocks", async () => {
  const current = bundle();
  for (const value of [" ", "x".repeat(2001)]) await assert.rejects(current.service.report(samId, { reason: "fake_account", details: value }, token), error => error.error.code === "VALIDATION_ERROR");
  const result = await current.service.report(samId, { reason: "fake_account", details: "  Synthetic fake profile evidence  " }, token);
  assert.equal(result.details, "Synthetic fake profile evidence");
  assert.equal((await current.profiles.publicProfile("sam_demo", token)).hasLikedMe, true);
  const blocked = bundle("blocked");
  await assert.rejects(blocked.profiles.publicProfile("sam_demo", token));
  assert(await blocked.service.report(samId, { reason: "fake_account", details: "Synthetic evidence" }, token));
  assert(await blocked.service.block(samId, token));
});

test("lists use shared pagination and reject private actor fields and inconsistent status", async () => {
  const current = bundle();
  const first = await current.service.views({ page: 1, limit: 1 }, token);
  const next = await current.service.views({ page: 2, limit: 1 }, token);
  assert.equal(first.pagination.totalPages, 3);
  assert.notEqual(first.items[0].viewer.id, next.items[0].viewer.id);
  const likes = await current.service.likes({}, token);
  assert(isInteractionPage(likes, isLike));
  const record = likes.items[0];
  assert(!isInteractionPage({ ...likes, items: [{ ...record, actor: { ...record.actor, email: "private" } }] }, isLike));
  assert(!isInteractionPage({ ...likes, items: [{ ...record, actor: { ...record.actor, location: { city: "Rabat", neighborhood: null, latitude: 34 } } }] }, isLike));
  assert(!isLikeStatus({ likedByMe: false, hasLikedMe: true, isConnected: true }));
  assert.equal((await bundle("empty").service.likes({}, token)).items.length, 0);
});

test("real adapter sends canonical methods, bodies and pagination and accepts both block statuses/204", async () => {
  const current = bundle();
  const received = await current.service.likes({}, token);
  const viewers = await current.service.views({}, token);
  const connections = await current.service.connections({}, token);
  const calls = [];
  let repeated = false;
  const client = createApiClient("https://api.example.invalid/api", undefined, async (url, options) => {
    calls.push({ url, options });
    let status = 200; let data;
    if (url.pathname.endsWith("/like")) { status = options.method === "POST" ? 201 : 200; data = { likedByMe: options.method === "POST", hasLikedMe: true, isConnected: options.method === "POST" }; }
    else if (url.pathname.endsWith("/view")) { status = 201; data = { message: "Recorded" }; }
    else if (url.pathname.endsWith("/block")) { if (options.method === "DELETE") return new Response(null, { status: 204 }); status = repeated ? 200 : 201; repeated = true; data = { id: samId, blockedUserId: samId, createdAt: "2026-11-05T10:00:00Z" }; }
    else if (url.pathname.endsWith("/report")) { status = 201; data = { ...JSON.parse(options.body), id: samId, reportedUserId: samId, createdAt: "2026-11-05T10:00:00Z" }; }
    else data = url.pathname.endsWith("/likes-received") ? received : url.pathname.endsWith("/views") ? viewers : connections;
    return new Response(JSON.stringify({ success: true, data, error: null }), { status, headers: { "Content-Type": "application/json" } });
  });
  const real = createRealInteractionService(client);
  await real.like(samId, token); await real.unlike(samId, token); await real.visit(samId, token);
  await real.block(samId, token); await real.block(samId, token); await real.unblock(samId, token);
  await real.report(samId, { reason: "fake_account", details: "Evidence" }, token);
  await real.likes({ page: 2, limit: 1 }, token); await real.views({}, token); await real.connections({}, token);
  assert.deepEqual(calls.slice(0, 7).map(call => call.options.method), ["POST", "DELETE", "POST", "POST", "POST", "DELETE", "POST"]);
  assert.equal(calls[2].url.pathname, `/api/profiles/${samId}/view`);
  assert.equal(calls[7].url.pathname, "/api/interactions/likes-received");
  assert.equal(calls[7].url.searchParams.get("page"), "2");
  assert.equal(calls[8].url.pathname, "/api/interactions/views");
  assert.equal(calls[9].url.pathname, "/api/interactions/connections");
  assert.deepEqual(JSON.parse(calls[6].options.body), { reason: "fake_account", details: "Evidence" });
  assert(calls.every(call => call.options.headers.get("Authorization") === `Bearer ${token}` && call.options.credentials === "omit"));
});

test("StrictMode, relationship changes and profile reloads do not duplicate visits", async context => {
  const current = bundle(); let visits = 0;
  current.service.visit = async () => { visits++; return { message: "Recorded" }; };
  const router = await mount(context, current);
  assert.equal(visits, 1);
  await click(button("Like"));
  assert(text().includes("You are connected."));
  assert.equal(visits, 1);
  await click(button("Unlike"));
  assert(text().includes("You are not connected."));
  current.service.like = async () => { throw new ApiRequestError(409, { code: "ALREADY_LIKED", message: "Stale" }); };
  await click(button("Like"));
  await click(button("Refresh profile"));
  await settle();
  assert.equal(visits, 1);
  await act(async () => router.navigate("/profiles/noor_demo"));
  await settle();
  assert.equal(visits, 2);
});

test("UI locks duplicate likes, uses returned mutual status and exposes errors", async context => {
  const current = bundle(); let finish; let likes = 0;
  current.service.like = () => { likes++; return new Promise(resolve => { finish = resolve; }); };
  await mount(context, current);
  await act(async () => { button("Like").click(); button("Like").click(); });
  assert.equal(likes, 1); assert(button("Like").disabled);
  await act(async () => finish({ likedByMe: true, hasLikedMe: true, isConnected: true }));
  assert(button("Unlike")); assert(text().includes("You are connected."));
  current.service.unlike = async () => { throw new ApiRequestError(403, { code: "USER_BLOCKED", message: "No access" }); };
  await click(button("Unlike"));
  assert(text().includes("This interaction is unavailable."));
});

test("report form validates details, sends fake_account and leaves relationship intact", async context => {
  const current = bundle(); let sent;
  const report = current.service.report;
  current.service.report = (id, body, value) => { sent = body; return report(id, body, value); };
  await mount(context, current);
  await click(button("Report fake profile")); await click(button("Send report"));
  assert(text().includes("1 to 2,000 characters"));
  await details("  Synthetic evidence  "); await click(button("Send report"));
  assert.deepEqual(sent, { reason: "fake_account", details: "Synthetic evidence" });
  assert(text().includes("Report sent")); assert(button("Like")); assert(!button("Unblock"));
});

test("block confirmation hides profile; session block affordance allows unblock without restored likes", async context => {
  const current = bundle();
  const router = await mount(context, current);
  await click(button("Like")); await click(button("Block")); await click(button("Cancel"));
  assert(button("Unlike"));
  await click(button("Block")); await click(button("Confirm block"));
  assert(text().includes("Profile blocked")); assert(!text().includes("Weekend trails")); assert(button("Unblock"));
  await act(async () => router.navigate("/interactions/connections")); await settle();
  const link = document.querySelector('a[href="/profiles/sam_demo"]'); assert(link);
  await click(link); await click(button("Unblock")); await settle();
  assert(button("Like")); assert(text().includes("No like received."));
});

test("masked profiles keep safety controls when a canonical target ID is known", async context => {
  const current = bundle("blocked");
  const router = await mount(context, current, "/interactions/views");
  await act(async () => router.navigate("/profiles/sam_demo", { state: { userId: samId } })); await settle();
  assert(text().includes("This profile is unavailable")); assert(!button("Like"));
  assert(button("Block")); assert(button("Report fake profile"));
  await click(button("Report fake profile")); await details("Synthetic evidence"); await click(button("Send report"));
  assert(text().includes("Report sent"));
});

test("relationship pages paginate, navigate and display privacy-safe data; errors/empty retry", async context => {
  const current = bundle();
  const likes = current.service.likes;
  current.service.likes = query => likes({ ...query, limit: 1 }, token);
  const router = await mount(context, current, "/interactions/likes");
  assert(text().includes("Who liked you")); assert(text().includes("Page 1 of 2"));
  assert(!text().includes("demo@example.invalid")); assert(!text().includes("33.5731"));
  await click(button("Next")); assert(text().includes("Page 2 of 2")); assert(button("Next").disabled);
  await click(document.querySelector('.relationship-cards a'));
  assert(router.state.location.pathname === "/profiles/noor_demo");
  await settle(); assert(button("Unlike"));
  current.service.views = async () => { throw new Error("Network fixture"); };
  await act(async () => router.navigate("/interactions/views")); await settle(); assert(button("Try again"));
  current.service.views = async () => ({ items: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } });
  await click(button("Try again")); assert(text().includes("No profile visits yet."));
});

test("self profiles do not record visits or offer actions", async context => {
  const current = bundle(); let visits = 0;
  current.service.visit = async () => { visits++; return { message: "Recorded" }; };
  await mount(context, current, "/profiles/demo");
  assert.equal(visits, 0); assert(!button("Like")); assert(!button("Block"));
});

test("ineligible likes show actionable profile/photo guidance without changing relationship state", async context => {
  await mount(context, bundle("no_picture"));
  await click(button("Like"));
  assert(text().includes("Add a main profile photo"));
  assert(document.querySelector('a[href="/profile/pictures"]'));
  assert(button("Like")); assert(!button("Unlike"));
});

test("failed visits are shown and never retried by rerenders or relationship changes", async context => {
  const current = bundle(); let visits = 0;
  current.service.visit = async () => { visits++; throw new Error("Uncertain outcome"); };
  await mount(context, current);
  assert.equal(visits, 1); assert(text().includes("will not be retried automatically"));
  await click(button("Like")); await click(button("Unlike"));
  assert.equal(visits, 1);
});

test("late profile action completion cannot overwrite the next profile", async context => {
  const current = bundle(); let finish;
  current.service.like = () => new Promise(resolve => { finish = resolve; });
  const router = await mount(context, current);
  await click(button("Like"));
  await act(async () => router.navigate("/profiles/robin_demo")); await settle();
  await act(async () => finish({ likedByMe: true, hasLikedMe: true, isConnected: true }));
  assert(document.querySelector("h1").textContent.includes("Robin"));
  assert(button("Like")); assert(!text().includes("You are now connected."));
});

test("production selection excludes mock modules even with mock flags enabled", async () => {
  const output = await build({ entryPoints: [new URL("../src/features/interactions/InteractionProvider.tsx", import.meta.url).pathname], bundle: true, write: false, format: "esm", minify: true, platform: "browser", define: { "import.meta.env.DEV": "false", "import.meta.env.VITE_INTERACTIONS_MOCK": '"true"', "import.meta.env.VITE_PROFILE_MOCK": '"true"', "import.meta.env.VITE_API_URL": '"http://localhost:3000/api"' } });
  const source = output.outputFiles[0].text;
  assert(!source.includes("noor_demo")); assert(!source.includes("robin_demo"));
  assert(source.includes("/api/interactions/likes-received"));
});
