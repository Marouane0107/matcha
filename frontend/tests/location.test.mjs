import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createElement, act } from "react";
import { createMockProfileService } from "../src/features/profile/mock.ts";
import { createRealProfileService, isPublicProfile } from "../src/features/profile/service.ts";
import { createApiClient } from "../src/services/api/client.ts";
import { locationErrors } from "../src/features/location/validation.ts";

const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost/profile/location" });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
const { createRoot } = await import("react-dom/client");
const { createMemoryRouter, RouterProvider } = await import("react-router-dom");
const { AuthProvider } = await import("../src/features/auth/AuthProvider.tsx");
const { ProfileProvider } = await import("../src/features/profile/ProfileProvider.tsx");
const { default: LocationPage } = await import("../src/pages/LocationPage.tsx");
const token = "synthetic-location-token";
const snapshot = { accessToken: token };
const session = { subscribe: () => () => {}, getSnapshot: () => snapshot, expireIfNeeded() {} };
const flush = () => new Promise(resolve => setTimeout(resolve, 15));
const button = label => [...document.querySelectorAll("button")].find(element => element.textContent === label);
const click = async element => { assert(element); await act(async () => { element.click(); await flush(); }); };
const input = async (name, value) => act(async () => {
  const element = document.querySelector(`input[name="${name}"]`);
  Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set.call(element, value);
  element.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
});
const text = () => document.body.textContent;
const position = (accuracy = 30) => ({ coords: { latitude: 33.58, longitude: -7.61, accuracy } });
async function mount(context, service = createMockProfileService(0)) {
  const requests = [];
  Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
  Object.defineProperty(window.navigator, "geolocation", { configurable: true, value: { getCurrentPosition: (success, error, options) => requests.push({ success, error, options }) } });
  const router = createMemoryRouter([{ path: "/profile/location", element: createElement(LocationPage) }, { path: "*", element: createElement("p", null, "Profile") }], { initialEntries: ["/profile", "/profile/location"], initialIndex: 1 });
  const root = createRoot(document.getElementById("root"));
  await act(async () => root.render(createElement(AuthProvider, { session, service: {} }, createElement(ProfileProvider, { service }, createElement(RouterProvider, { router })))));
  await act(flush);
  context.after(async () => { await act(async () => root.unmount()); router.dispose(); });
  return { requests, router, service };
}
async function startGPS() {
  await click(document.querySelector('input[name="location-method"]'));
  await click(button("Use my current location"));
  await click(button("Allow location request"));
}

test("GPS is requested once only after consent, then requires confirmation before save", async context => {
  const { requests, service } = await mount(context);
  assert.equal(requests.length, 0);
  await click(document.querySelector('input[name="location-method"]'));
  await click(button("Use my current location"));
  assert.equal(requests.length, 0);
  await click(button("Allow location request"));
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].options, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  await act(async () => requests[0].success(position()));
  assert(text().includes("Position ready"));
  assert.equal((await service.me(token)).location, null);
  await input("city", "Casablanca");
  await click(button("Confirm and save location"));
  await act(flush);
  assert.equal((await service.me(token)).location.mode, "gps");
  assert(text().includes("Location saved"));
  assert(!text().includes("33.58"));
});

for (const [code, message] of [[1, "permission was denied"], [2, "position is unavailable"], [3, "timed out"]]) {
  test(`GPS error ${code} is shown without silently switching methods`, async context => {
    const { requests } = await mount(context);
    await startGPS();
    await act(async () => requests[0].error({ code }));
    assert(text().includes(message));
    assert(document.querySelector('input[name="location-method"]').checked);
    assert(button("Confirm and save location").disabled);
  });
}

test("unsupported and insecure contexts offer manual entry without GPS calls", async context => {
  const { requests } = await mount(context);
  Object.defineProperty(window.navigator, "geolocation", { configurable: true, value: undefined });
  await startGPS();
  assert(text().includes("does not support GPS"));
  Object.defineProperty(window, "isSecureContext", { configurable: true, value: false });
  await click(button("Allow location request"));
  assert(text().includes("secure connection"));
  assert.equal(requests.length, 0);
});

test("poor accuracy is rejected and switching modes ignores stale GPS results", async context => {
  const { requests } = await mount(context);
  await startGPS();
  await act(async () => requests[0].success(position(4000)));
  assert(text().includes("not accurate enough"));
  await click(button("Allow location request"));
  await click(document.querySelectorAll('input[name="location-method"]')[1]);
  await act(async () => requests[1].success(position()));
  assert(!text().includes("Position ready"));
  assert(button("Save location"));
  await click(document.querySelector('input[name="location-method"]'));
  assert(button("Confirm and save location").disabled);
});

test("unmounted GPS requests ignore both success and error callbacks", async context => {
  const { requests, router } = await mount(context);
  await startGPS();
  await act(async () => router.navigate("/profile"));
  await act(async () => { requests[0].success(position()); requests[0].error({ code: 1 }); });
  assert.equal(text(), "Profile");
});

test("manual city is required, neighborhood is optional, save refetches owner state", async context => {
  const service = createMockProfileService(0);
  let reads = 0;
  const wrapped = { ...service, me: async value => { reads++; return service.me(value); } };
  await mount(context, wrapped);
  await click(button("Save location"));
  assert(text().includes("Enter a city"));
  await input("city", "  Casablanca  ");
  await click(button("Save location"));
  await act(flush);
  assert.equal((await service.me(token)).location.neighborhood, null);
  assert.equal(reads, 2);
  assert(text().includes("Casablanca"));
  await input("neighborhood", "Maarif");
  await click(button("Save location"));
  await act(flush);
  assert.equal((await service.me(token)).location.neighborhood, "Maarif");
});

test("manual API errors preserve location and allow correction/retry", async context => {
  const { service } = await mount(context);
  for (const [city, message] of [["unresolved", "could not be resolved"], ["offline", "Couldn't reach Matcha"], ["outage", "Something went wrong"]]) {
    await input("city", city);
    await click(button("Save location"));
    assert(text().includes(message), text());
    assert.equal((await service.me(token)).location, null);
  }
});

test("unsaved location navigation supports staying and discarding", async context => {
  const { router } = await mount(context);
  await input("city", "Rabat");
  await act(async () => router.navigate(-1));
  assert(document.querySelector("dialog").open);
  await click(button("Stay on this page"));
  assert.equal(document.querySelector('input[name="city"]').value, "Rabat");
  await click(document.querySelector('a[href="/profile"]'));
  await click(button("Discard changes"));
  assert.equal(router.state.location.pathname, "/profile");
});

test("leaving during a save ignores late UI completion without pretending to cancel the server", async context => {
  const mock = createMockProfileService(0);
  let finish;
  const { router } = await mount(context, { ...mock, updateLocation: () => new Promise(resolve => { finish = resolve; }) });
  await input("city", "Paris");
  await click(button("Save location"));
  await act(async () => router.navigate("/profile"));
  assert(text().includes("Leaving cannot cancel a request already sent"));
  await click(button("Discard changes"));
  await act(async () => finish(await mock.me(token)));
  assert.equal(text(), "Profile");
});

test("location adapters share canonical request/response shapes, update completion and protect public data", async () => {
  const mock = createMockProfileService(0);
  const tags = await mock.tags(token);
  await mock.update({ dateOfBirth: "1996-01-01", gender: "non_binary", bio: "Synthetic biography", tagIds: [tags[0].id] }, token);
  await mock.upload(new File(["synthetic"], "fixture.png", { type: "image/png" }), token);
  assert.equal((await mock.me(token)).profileComplete, false);
  const calls = [];
  const real = createRealProfileService(createApiClient("https://api.example.invalid/api", undefined, async (url, options) => {
    calls.push({ url, options });
    const updated = await mock.updateLocation(JSON.parse(options.body), token);
    return new Response(JSON.stringify({ success: true, data: updated, error: null }), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
  const updated = await real.updateLocation({ mode: "manual", city: "Casablanca", neighborhood: null }, token);
  assert.equal(updated.profileComplete, true);
  assert.equal(calls[0].url.pathname, "/api/profile/location");
  assert.equal(calls[0].options.method, "PATCH");
  assert.equal(calls[0].options.headers.get("Authorization"), `Bearer ${token}`);
  assert.deepEqual(JSON.parse(calls[0].options.body), { mode: "manual", city: "Casablanca", neighborhood: null });
  const gps = { mode: "gps", city: "Rabat", neighborhood: "Agdal", latitude: 34.01, longitude: -6.84 };
  await real.updateLocation(gps, token);
  assert.deepEqual(JSON.parse(calls[1].options.body), gps);
  const publicData = await mock.publicProfile("demo", token);
  assert.deepEqual(Object.keys(publicData.location).sort(), ["city", "neighborhood"]);
  assert(isPublicProfile(publicData));
  assert(!isPublicProfile({ ...publicData, location: updated.location }));
  await assert.rejects(mock.updateLocation({ ...gps, latitude: Infinity }, token));
  assert.equal((await mock.me(token)).location.city, "Rabat");
});

test("manual validation follows text bounds and rejects coordinates", () => {
  assert.deepEqual(locationErrors({ mode: "manual", city: "Rabat", neighborhood: null }), {});
  assert(locationErrors({ mode: "manual", city: " ", neighborhood: null }).city);
  assert(locationErrors({ mode: "manual", city: "x".repeat(101), neighborhood: null }).city);
  assert(locationErrors({ mode: "manual", city: "Rabat", neighborhood: "\n" }).neighborhood);
  assert(locationErrors({ mode: "manual", city: "Rabat", neighborhood: null, latitude: 1 }).gps);
});
