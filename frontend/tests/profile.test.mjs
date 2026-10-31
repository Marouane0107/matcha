import test from "node:test";
import assert from "node:assert/strict";
import { createApiClient } from "../src/services/api/client.ts";
import { ERROR_CODES, API_ROUTES } from "@matcha/shared";
import { createMockProfileService } from "../src/features/profile/mock.ts";
import { createRealProfileService, isUserProfile, isPublicProfile, isPictures } from "../src/features/profile/service.ts";
import { ageFromDate, completionChecklist, pictureError, toggleTag, validateProfile } from "../src/features/profile/validation.ts";
import { readFragmentToken } from "../src/features/auth/utils/validation.ts";

const token = "synthetic-profile-test-token";
const file = () => new File(["synthetic image"], "test.png", { type: "image/png" });
const envelope = data => new Response(JSON.stringify({ success: true, data, error: null }), { headers: { "Content-Type": "application/json" } });

test("profile transport supports multipart and authenticated image bytes without URL tokens", async () => {
  const calls = [];
  const client = createApiClient("https://api.example.invalid/api", undefined, async (url, options) => {
    calls.push({ url, options });
    return new Response(new Blob(["synthetic"], { type: "image/png" }), { status: 200 });
  });
  const form = new FormData();
  form.append("picture", new Blob(["synthetic"], { type: "image/png" }), "test.png");
  await client.request("/api/profile/pictures", { method: "POST", body: form, accessToken: "synthetic", status: 200, responseType: "image", validate: value => value instanceof Blob });
  assert.equal(calls[0].options.body, form);
  assert.equal(calls[0].options.headers.has("Content-Type"), false);
  assert.equal(calls[0].options.headers.get("Authorization"), "Bearer synthetic");
  assert.equal(calls[0].url.search, "");
  assert.equal(calls[0].options.credentials, "omit");
  assert.equal(calls[0].options.cache, "no-store");
  assert.equal(calls[0].options.redirect, "error");
});

test("owner loading and updates retain shared shape and replace the complete tag set", async () => {
  const service = createMockProfileService(0);
  const initial = await service.me(token);
  assert(isUserProfile(initial));
  assert.equal(initial.sexualPreference, "everyone");
  const tags = await service.tags(token);
  const updated = await service.update({ firstName: "Taylor", dateOfBirth: "1996-02-29", gender: "non_binary", bio: "A synthetic biography", tagIds: [tags[0].id, tags[1].id] }, token);
  assert(isUserProfile(updated));
  assert.equal(updated.firstName, "Taylor");
  assert.equal(updated.tags.length, 2);
  assert.equal((await service.update({ tagIds: [tags[2].id] }, token)).tags.length, 1);
  assert.equal((await service.update({ tagIds: [] }, token)).tags.length, 0);
  await assert.rejects(service.update({ tagIds: ["unknown"] }, token), error => error.error.code === ERROR_CODES.VALIDATION_ERROR);
  await assert.rejects(service.me(""), error => error.status === 401);
});

test("validation honors calendar dates, UTC age boundaries, enums and Unicode lengths", () => {
  const now = new Date("2026-10-21T00:00:00Z");
  assert.equal(ageFromDate("2008-10-21", now), 18);
  assert.equal(ageFromDate("2008-10-22", now), 17);
  assert.equal(ageFromDate("2000-02-30", now), null);
  assert.equal(ageFromDate("1906-10-21", now), 120);
  assert.deepEqual(validateProfile({ dateOfBirth: "2008-10-21", bio: "" }, now), {});
  for (const dateOfBirth of ["2008-10-22", "1905-10-21", "2000-02-30", "not a date"]) assert(validateProfile({ dateOfBirth }, now).dateOfBirth);
  assert(validateProfile({ gender: "invalid", sexualPreference: "bisexual" }).gender);
  assert(validateProfile({ firstName: " ", lastName: "\u0000", bio: "a".repeat(1001) }).bio);
  assert.equal(validateProfile({ bio: "🌿".repeat(1000) }).bio, undefined);
});

test("tag toggle permits removal at the ten-tag limit and never grows past it", () => {
  const selected = Array.from({ length: 10 }, (_, index) => String(index));
  assert.equal(toggleTag(selected, "other"), selected);
  assert.equal(toggleTag(selected, "0").length, 9);
  assert.deepEqual(toggleTag([], "new"), ["new"]);
});

test("photo UX validation rejects wrong MIME, empty, oversized and sixth files", () => {
  assert.equal(pictureError({ type: "image/webp", size: 5242880 }, 4), undefined);
  assert(pictureError({ type: "image/svg+xml", size: 10 }, 0));
  assert(pictureError({ type: "image/png", size: 0 }, 0));
  assert(pictureError({ type: "image/png", size: 5242881 }, 0));
  assert(pictureError({ type: "image/png", size: 10 }, 5));
});

test("photo mutations enforce five pictures, one main, promotion and authenticated reads", async () => {
  const service = createMockProfileService(0);
  let collection;
  for (let count = 0; count < 5; count++) collection = await service.upload(file(), token);
  assert(isPictures(collection));
  assert.equal(collection.pictures[0].isMain, true);
  await assert.rejects(service.upload(file(), token), error => error.error.code === ERROR_CODES.UPLOAD_LIMIT_REACHED);
  const second = collection.pictures[1].id;
  collection = await service.setMain(second, token);
  assert.equal(collection.pictures.filter(picture => picture.isMain).length, 1);
  assert.equal(collection.pictures.find(picture => picture.isMain).id, second);
  assert((await service.image(second, token)) instanceof Blob);
  collection = await service.remove(second, token);
  assert(isPictures(collection));
  assert.equal(collection.pictures[0].isMain, true);
  assert.deepEqual(collection.pictures.map(picture => picture.position), [1, 2, 3, 4]);
  await assert.rejects(service.image(second, token), error => error.status === 404);
});

test("public service never returns private owner data and distinguishes unavailable/network failures", async () => {
  const service = createMockProfileService(0);
  const owner = await service.me(token);
  const publicData = await service.publicProfile("demo", token);
  assert(isPublicProfile(publicData));
  assert(!isPublicProfile(owner));
  for (const key of ["email", "dateOfBirth", "profileComplete", "latitude", "longitude", "accessToken"]) assert.equal(key in publicData, false);
  assert(!isPublicProfile({ ...publicData, email: "leak@example.invalid" }));
  assert(!isPublicProfile({ ...publicData, location: { city: "Example", neighborhood: null, latitude: 1, longitude: 1 } }));
  await assert.rejects(service.publicProfile("missing", token), error => error.error.code === ERROR_CODES.PROFILE_NOT_FOUND);
  await assert.rejects(service.publicProfile("offline", token), error => error.kind === "network");
});

test("completion checklist has exactly Phase 0 requirements and does not redefine server status", async () => {
  const service = createMockProfileService(0);
  const owner = await service.me(token);
  const checklist = completionChecklist(owner, true);
  assert.equal(checklist.length, 8);
  assert.equal(checklist.some(item => /preference|orientation/i.test(item.label)), false);
  const ready = { ...owner, dateOfBirth: "1995-01-01", gender: "man", bio: "Hi", tags: [{ id: "tag", name: "art" }], pictures: [{ id: "image", url: "", position: 1, isMain: true }], location: { city: "Example", neighborhood: null, latitude: 0, longitude: 0, mode: "manual" }, profileComplete: false };
  assert(completionChecklist(ready, true).every(item => item.done));
  assert.equal(ready.profileComplete, false);
  assert.equal(completionChecklist(ready, false).find(item => item.label === "Verified email").done, false);
});

test("email change keeps active email until verification, checks password and consumes token", async () => {
  const service = createMockProfileService(0);
  await assert.rejects(service.changeEmail({ newEmail: "next@example.invalid", password: "wrong" }, token), error => error.error.code === ERROR_CODES.INVALID_CURRENT_PASSWORD);
  await service.changeEmail({ newEmail: "next@example.invalid", password: "DemoPassword123" }, token);
  assert.equal((await service.me(token)).email, "demo@example.invalid");
  await service.verifyEmailChange({ token: "c".repeat(64) });
  assert.equal((await service.me(token)).email, "next@example.invalid");
  await assert.rejects(service.verifyEmailChange({ token: "c".repeat(64) }), error => error.error.code === ERROR_CODES.INVALID_EMAIL_CHANGE_TOKEN);
});

test("email-change fragments are removed before use", () => {
  const calls = [];
  const parsed = readFragmentToken({ pathname: "/verify-email-change", hash: `#token=${"c".repeat(64)}`, search: "" }, { state: null, replaceState: (...args) => calls.push(args) });
  assert.equal(parsed.token, "c".repeat(64));
  assert.deepEqual(calls, [[null, "", "/verify-email-change"]]);
});

test("a repeated email change replaces the pending mock token", async () => {
  const service = createMockProfileService(0);
  await service.changeEmail({ newEmail: "first@example.invalid", password: "DemoPassword123" }, token);
  await service.changeEmail({ newEmail: "second@example.invalid", password: "DemoPassword123" }, token);
  await assert.rejects(service.verifyEmailChange({ token: "c".repeat(64) }), error => error.error.code === ERROR_CODES.INVALID_EMAIL_CHANGE_TOKEN);
  await service.verifyEmailChange({ token: "2".padStart(64, "c") });
  assert.equal((await service.me(token)).email, "second@example.invalid");
});

test("real adapter sends canonical paths, complete tag IDs, multipart field and no bearer for verification", async () => {
  const fixture = createMockProfileService(0);
  const owner = await fixture.me(token);
  const calls = [];
  const client = createApiClient("https://api.example.invalid/api", undefined, async (url, options) => {
    calls.push({ url, options });
    if (url.pathname === API_ROUTES.PROFILE.ME) return envelope(owner);
    if (url.pathname === API_ROUTES.PROFILE.TAGS) return envelope(await fixture.tags(token));
    if (url.pathname.startsWith("/api/profiles/")) return envelope(await fixture.publicProfile("demo", token));
    if (url.pathname.startsWith("/api/auth/")) return envelope({ message: "OK" });
    if (options.method === "GET") return new Response(new Blob(["test"], { type: "image/webp" }));
    return new Response(JSON.stringify({ success: true, data: { pictures: [] }, error: null }), { status: options.method === "POST" ? 201 : 200, headers: { "Content-Type": "application/json" } });
  });
  const service = createRealProfileService(client);
  await service.me(token);
  await service.update({ tagIds: [] }, token);
  await service.tags(token);
  await service.publicProfile("demo", token);
  await service.upload(file(), token);
  await service.image("image", token);
  await service.setMain("image", token);
  await service.remove("image", token);
  await service.changeEmail({ newEmail: "next@example.invalid", password: "synthetic" }, token);
  await service.verifyEmailChange({ token: "c".repeat(64) });
  assert.equal(calls[1].options.method, "PATCH");
  assert.deepEqual(JSON.parse(calls[1].options.body), { tagIds: [] });
  assert(calls[4].options.body.get("picture") instanceof File);
  assert.equal(calls[6].url.pathname, "/api/profile/pictures/image/main");
  assert.equal(calls[7].options.method, "DELETE");
  calls.slice(0, -1).forEach(call => assert.equal(call.options.headers.get("Authorization"), `Bearer ${token}`));
  assert.equal(calls.at(-1).options.headers.has("Authorization"), false);
});

test("incompatible backend envelopes and non-image success bodies are rejected", async () => {
  const client = createApiClient("https://api.example.invalid", undefined, async () => new Response(JSON.stringify({ status: "success", data: { profile: {} } }), { headers: { "Content-Type": "application/json" } }));
  await assert.rejects(createRealProfileService(client).me(token), error => error.kind === "malformed");
  await assert.rejects(createRealProfileService(client).image("id", token), error => error.kind === "malformed");
});
