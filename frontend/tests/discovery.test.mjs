import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createElement, act } from "react";
import { build } from "esbuild";
import { createApiClient, ApiRequestError, TransportError } from "../src/services/api/client.ts";
import { createRealDiscoveryService, serializeSearch, isSearchPage } from "../src/features/discovery/service.ts";
import { createMockDiscoveryService } from "../src/features/discovery/mock.ts";
import { createMockProfileService } from "../src/features/profile/mock.ts";
import { searchErrors } from "../src/features/discovery/validation.ts";

const token = "synthetic-discovery-token";
const profiles = createMockProfileService(0);
const mock = createMockDiscoveryService(profiles, "populated", 0);
const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost/browse" });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import("react-dom/client");
const { createMemoryRouter, RouterProvider } = await import("react-router-dom");
const { AuthProvider } = await import("../src/features/auth/AuthProvider.tsx");
const { ProfileProvider } = await import("../src/features/profile/ProfileProvider.tsx");
const { DiscoveryProvider } = await import("../src/features/discovery/DiscoveryProvider.tsx");
const { default: DiscoveryPage } = await import("../src/pages/DiscoveryPage.tsx");
const { default: PublicProfilePage } = await import("../src/pages/PublicProfilePage.tsx");
const snapshot = { accessToken: token };
const session = { subscribe: () => () => {}, getSnapshot: () => snapshot, expireIfNeeded() {} };
const flush = () => new Promise(resolve => setTimeout(resolve, 20));
const text = () => document.body.textContent;
const button = label => [...document.querySelectorAll("button")].find(element => element.textContent === label);
const click = element => act(async () => { assert(element); element.click(); await flush(); });
const change = (selector, value) => act(async () => {
  const element = document.querySelector(selector);
  const prototype = element.tagName === "SELECT" ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value").set.call(element, value);
  element.dispatchEvent(new window.Event(element.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
});

async function mount(context, service = mock, mode = "suggestions", profileService = profiles) {
  const router = createMemoryRouter([
    { path: "/browse", element: createElement(DiscoveryPage, { mode }) },
    { path: "/profiles/:username", element: createElement(PublicProfilePage) },
  ], { initialEntries: ["/browse"] });
  const root = createRoot(document.getElementById("root"));
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  URL.createObjectURL = () => "blob:synthetic-image";
  URL.revokeObjectURL = () => {};
  await act(async () => root.render(createElement(AuthProvider, { session, service: {} }, createElement(ProfileProvider, { service: profileService }, createElement(DiscoveryProvider, { service }, createElement(RouterProvider, { router }))))));
  context.after(async () => { await act(async () => root.unmount()); router.dispose(); URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke; });
  return router;
}

test("search serializer encodes only canonical keys, tag list and optional origin once", () => {
  const query = { minAge: 20, maxAge: 35, minFame: 5, maxFame: 90, maxDistance: 50, sortBy: "commonTags", sortOrder: "desc", page: 2, limit: 12, tags: ["first", "second"], location: { latitude: 33.5, longitude: -7.6 }, injected: "ignored" };
  const params = serializeSearch(query);
  assert.equal(params.get("location"), "33.5,-7.6");
  assert.equal(params.get("tags"), "first,second");
  assert.equal(params.get("sortBy"), "commonTags");
  assert.equal(params.get("page"), "2");
  assert(!params.has("injected"));
  assert.equal(serializeSearch({ tags: [] }).toString(), "");
});

test("real endpoints send authenticated structured query and preserve path/origin protections", async () => {
  const calls = [];
  const data = await mock.search({ page: 2, limit: 3 }, token);
  const client = createApiClient("https://api.example.invalid/api", undefined, async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ success: true, data, error: null }), { headers: { "Content-Type": "application/json" } });
  });
  const real = createRealDiscoveryService(client);
  assert.deepEqual(await real.search({ page: 2, limit: 3 }, token), data);
  await real.suggestions({ sortBy: "fame", sortOrder: "desc" }, token);
  assert.equal(calls[0].url.pathname, "/api/profiles/search");
  assert.equal(calls[1].url.pathname, "/api/profiles/suggestions");
  assert.equal(calls[0].url.searchParams.get("page"), "2");
  assert.equal(calls[0].options.headers.get("Authorization"), `Bearer ${token}`);
  assert.equal(calls[0].options.credentials, "omit");
  await assert.rejects(client.request("/api/profiles/search?page=2", { status: 200, validate: isSearchPage }), error => error.kind === "configuration");
  assert.equal(calls.length, 2);
});

test("filter validation enforces finite ranges, age integers, ordering and distinct tags", () => {
  assert.deepEqual(searchErrors({ minAge: 18, maxAge: 120, minFame: 0, maxFame: 100, maxDistance: 20000 }), {});
  for (const query of [{ minAge: 17 }, { maxAge: 121 }, { minAge: 20.5 }, { minAge: 40, maxAge: 30 }, { minFame: -1 }, { maxFame: 101 }, { minFame: 90, maxFame: 10 }, { maxDistance: 0 }, { maxDistance: Infinity }, { maxDistance: 20001 }, { tags: ["bad"] }]) assert(Object.keys(searchErrors(query)).length);
});

test("legacy backend row responses are rejected rather than translated or used as fallback", async () => {
  const client = createApiClient("https://api.example.invalid/api", undefined, async () => new Response(JSON.stringify({ success: true, error: null, data: { profiles: [{ user_id: "legacy", latitude: 33.5, longitude: -7.6, birth_date: "1995-01-01" }], pagination: { page: 1, limit: 12, total: 1, totalPages: 1 } } }), { headers: { "Content-Type": "application/json" } }));
  await assert.rejects(createRealDiscoveryService(client).search({}, token), error => error.kind === "malformed");
});

test("mock adapters filter, sort all supported keys and paginate without leaking owner data", async () => {
  for (const sortBy of ["age", "distance", "fame", "commonTags"]) {
    const data = await mock.search({ sortBy, sortOrder: "desc", limit: 100 }, token);
    const key = { age: "age", distance: "distanceKm", fame: "fameRating", commonTags: "commonTags" }[sortBy];
    assert(data.items.every((item, index) => !index || data.items[index - 1][key] >= item[key]));
    assert(isSearchPage(data));
  }
  const first = await mock.suggestions({ page: 1, limit: 3 }, token);
  const second = await mock.suggestions({ page: 2, limit: 3 }, token);
  assert.equal(first.pagination.total, 16);
  assert.equal(first.pagination.totalPages, 6);
  assert.equal(second.items.length, 3);
  assert(!second.items.some(item => first.items.some(previous => previous.id === item.id)));
  const tag = (await profiles.tags(token))[0].id;
  const filtered = await mock.search({ minAge: 24, maxAge: 35, minFame: 5, maxFame: 90, maxDistance: 45, tags: [tag] }, token);
  assert(filtered.items.length);
  assert(filtered.items.every(item => item.age >= 24 && item.age <= 35 && item.distanceKm <= 45 && item.tags.some(value => value.id === tag)));
  const result = first.items[0];
  assert.match(result.pictures[0].id, /^[0-9a-f-]{36}$/);
  assert.equal((await profiles.image(result.pictures[0].id, token)).type, "image/png");
  for (const privateField of ["email", "dateOfBirth", "latitude", "accessToken"]) assert(!isSearchPage({ ...first, items: [{ ...result, [privateField]: "private" }] }));
  assert(!isSearchPage({ ...first, items: [{ ...result, location: { city: "Rabat", neighborhood: null, latitude: 34 } }] }));
});

test("mock scenarios explicitly support empty, eligibility, API and network failures", async () => {
  assert.equal((await createMockDiscoveryService(profiles, "empty", 0).search({}, token)).items.length, 0);
  for (const [scenario, code] of [["incomplete", "PROFILE_INCOMPLETE"], ["location", "LOCATION_REQUIRED"], ["api", "INTERNAL_ERROR"]]) await assert.rejects(createMockDiscoveryService(profiles, scenario, 0).suggestions({}, token), error => error instanceof ApiRequestError && error.error.code === code);
  await assert.rejects(createMockDiscoveryService(profiles, "network", 0).search({}, token), error => error instanceof TransportError && error.kind === "network");
});

test("suggestions load, render privacy-safe cards, paginate and navigate to existing public profile", async context => {
  const router = await mount(context);
  assert(text().includes("Loading profiles"));
  await act(async () => { await flush(); await flush(); });
  assert.equal(document.querySelectorAll("article").length, 12);
  assert(text().includes("16 profiles found"));
  assert(!text().includes("demo@example.invalid"));
  assert(!text().includes("33.5731"));
  await click(button("Next"));
  assert.equal(document.querySelectorAll("article").length, 4);
  assert(text().includes("Page 2 of 2"));
  assert(button("Next").disabled);
  await click(document.querySelector("article h2 a"));
  assert(router.state.location.pathname.startsWith("/profiles/browse_demo_"));
  await act(flush);
  assert(document.querySelector("h1").textContent.includes("Maya"));
});

test("search validates before requesting, submits sorting and resets page on filter changes", async context => {
  const calls = [];
  await mount(context, { ...mock, search: (query, value) => { calls.push(query); return mock.search(query, value); } }, "search");
  await act(async () => { await flush(); await flush(); });
  await change('input[name="minAge"]', "40");
  await change('input[name="maxAge"]', "25");
  await click(button("Search"));
  assert(text().includes("Maximum age must be at least"));
  assert.equal(calls.length, 1);
  await change('input[name="minAge"]', "25");
  await change('input[name="maxAge"]', "38");
  await change("#discovery-sort", "age");
  await change("#discovery-order", "desc");
  await click(button("Search"));
  assert.equal(calls.at(-1).sortBy, "age");
  assert.equal(calls.at(-1).page, 1);
  assert(document.querySelector("article h2").textContent.includes("38"));
  await click(button("Reset"));
  assert.equal(document.querySelector('input[name="minAge"]').value, "");
});

test("empty, network and incomplete states render recovery actions", async context => {
  let scenario = "empty";
  const service = { ...mock, suggestions: (query, value) => createMockDiscoveryService(profiles, scenario, 0).suggestions(query, value) };
  await mount(context, service);
  await act(async () => { await flush(); await flush(); });
  assert(text().includes("No profiles found"));
  scenario = "network";
  await click(button("Reset"));
  assert(text().includes("Couldn't reach Matcha"));
  scenario = "incomplete";
  await click(button("Try again"));
  assert(text().includes("Complete your profile"));
  assert(document.querySelector('a[href="/profile/location"]'));
});

test("late result cannot overwrite a newer criteria request", async context => {
  let resolveOld;
  let requests = 0;
  const data = await mock.search({}, token);
  const service = { ...mock, suggestions: () => ++requests === 1 ? new Promise(resolve => { resolveOld = resolve; }) : Promise.resolve({ items: [], pagination: { page: 1, limit: 12, total: 0, totalPages: 0 } }) };
  await mount(context, service);
  await click(button("Reset"));
  assert(text().includes("No profiles found"));
  await act(async () => resolveOld(data));
  assert(text().includes("No profiles found"));
  assert.equal(document.querySelectorAll("article").length, 0);
});

test("a result that becomes unavailable uses the existing public-profile error state", async context => {
  await mount(context, mock, "suggestions", { ...profiles, publicProfile: async () => { throw new ApiRequestError(404, { code: "PROFILE_NOT_FOUND", message: "Unavailable" }); } });
  await act(async () => { await flush(); await flush(); });
  await click(document.querySelector("article h2 a"));
  assert(text().includes("This profile is unavailable"));
  assert(button("Try again"));
});

test("production compilation cannot activate discovery mocks even with the flag true", async () => {
  const result = await build({ entryPoints: [new URL("../src/features/discovery/DiscoveryProvider.tsx", import.meta.url).pathname], bundle: true, write: false, minify: true, platform: "browser", format: "esm", define: { "import.meta.env.DEV": "false", "import.meta.env.VITE_DISCOVERY_MOCK": '"true"', "import.meta.env.VITE_API_URL": '"http://localhost:3000/api"' } });
  const source = result.outputFiles[0].text;
  assert(!source.includes("browse_demo_"));
  assert(!source.includes("SYNTHETIC PROFILE"));
  assert(source.includes("/api/profiles/suggestions"));
});
