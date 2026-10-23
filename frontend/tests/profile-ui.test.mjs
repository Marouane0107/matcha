import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createElement, act } from "react";

const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost/profile" });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
const { createRoot } = await import("react-dom/client");
const { createBrowserRouter, RouterProvider } = await import("react-router-dom");
const { AuthProvider } = await import("../src/features/auth/AuthProvider.tsx");
const { ProfileProvider } = await import("../src/features/profile/ProfileProvider.tsx");
const { ProfileImage } = await import("../src/features/profile/components.tsx");
const { default: EditProfilePage } = await import("../src/pages/EditProfilePage.tsx");
const { createMockProfileService } = await import("../src/features/profile/mock.ts");
const snapshot = { accessToken: "test-token", user: null };
const session = { subscribe: () => () => {}, getSnapshot: () => snapshot, expireIfNeeded() {} };
const flush = () => new Promise(resolve => setTimeout(resolve, 20));
const button = label => [...document.querySelectorAll("button")].find(element => element.textContent === label);
const click = async element => act(async () => { element.click(); await flush(); });
const changeBio = async value => act(async () => {
  const field = document.querySelector("#bio");
  Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, "value").set.call(field, value);
  field.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
});
const pop = async direction => act(async () => { window.history.go(direction); await flush(); });
const reloadPrevented = () => {
  const event = new dom.window.Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
};

async function mountEditor(context) {
  window.history.replaceState(null, "", "/profile");
  const mock = createMockProfileService(0);
  let profile = await mock.me("test-token");
  const tags = await mock.tags("test-token");
  const service = { ...mock, me: async () => profile, tags: async () => tags,
    update: async request => (profile = { ...profile, ...request }) };
  const router = createBrowserRouter([
    { path: "/profile/edit", element: createElement(EditProfilePage) },
    { path: "*", element: createElement("p", null, "Other page") },
  ], { window });
  const root = createRoot(document.getElementById("root"));
  await act(async () => {
    root.render(createElement(AuthProvider, { session, service: {} },
      createElement(ProfileProvider, { service }, createElement(RouterProvider, { router }))));
    await router.navigate("/profile/edit");
  });
  context.after(async () => { await act(async () => root.unmount()); router.dispose(); });
  assert(document.querySelector("#bio"));
  return router;
}

test("dirty browser Back can stay or discard without losing the history destination", async context => {
  await mountEditor(context);
  await changeBio("Unsaved biography");
  assert(reloadPrevented());
  await pop(-1);
  assert(document.querySelector("dialog").open);
  await click(button("Stay on this page"));
  assert.equal(window.location.pathname, "/profile/edit");
  assert.equal(document.querySelector("#bio").value, "Unsaved biography");
  await pop(-1);
  await click(button("Discard changes"));
  assert.equal(window.location.pathname, "/profile");
  assert.equal(reloadPrevented(), false);
});

test("dirty browser Forward can stay or discard; internal links use the same blocker", async context => {
  const router = await mountEditor(context);
  await act(async () => router.navigate("/account"));
  await pop(-1);
  await changeBio("Keep this draft");
  await pop(1);
  await click(button("Stay on this page"));
  assert.equal(window.location.pathname, "/profile/edit");
  await click(document.querySelector('a[href="/profile"]'));
  assert(document.querySelector("dialog").open);
  await act(async () => document.querySelector("dialog").dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  assert.equal(document.querySelector("dialog").open, false);
  await pop(1);
  await click(button("Discard changes"));
  assert.equal(window.location.pathname, "/account");
});

test("unchanged, reverted and successfully saved drafts do not block navigation or reload", async context => {
  await mountEditor(context);
  assert.equal(reloadPrevented(), false);
  await changeBio("Temporary");
  await changeBio("");
  assert.equal(reloadPrevented(), false);
  await pop(-1);
  assert.equal(window.location.pathname, "/profile");
  await pop(1);
  await changeBio("Saved biography");
  await click(button("Save changes"));
  assert(document.body.textContent.includes("Your profile has been saved."));
  assert.equal(reloadPrevented(), false);
  await pop(-1);
  assert.equal(window.location.pathname, "/profile");
  await pop(1);
  await click(document.querySelector('a[href="/profile"]'));
  assert.equal(window.location.pathname, "/profile");
});

test("authenticated image URLs are revoked on replacement/unmount and late responses allocate nothing", async context => {
  const created = [];
  const revoked = [];
  context.mock.method(URL, "createObjectURL", () => { const url = `blob:test-${created.length}`; created.push(url); return url; });
  context.mock.method(URL, "revokeObjectURL", url => revoked.push(url));
  let resolveLate;
  const service = { image: id => id === "late" ? new Promise(resolve => { resolveLate = resolve; }) : Promise.resolve(new Blob(["image"])) };
  const root = createRoot(document.getElementById("root"));
  const render = id => act(async () => root.render(createElement(AuthProvider, { session, service: {} },
    createElement(ProfileProvider, { service }, createElement(ProfileImage, { picture: { id }, alt: "Test" })))));
  await render("first");
  await render("second");
  assert.deepEqual(revoked, [created[0]]);
  await render("late");
  assert.deepEqual(revoked, created);
  await act(async () => root.unmount());
  await act(async () => resolveLate(new Blob(["late"])));
  assert.equal(created.length, 2);
  assert.deepEqual(revoked, created);
});
