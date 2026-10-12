import assert from "node:assert/strict";
import test from "node:test";
import { ERROR_CODES } from "@matcha/shared";
import { createApiClient, ApiRequestError, TransportError } from "../src/services/api/client.ts";
import { errorMessage } from "../src/features/auth/utils/errors.ts";
import { createMockAuthService } from "../src/features/auth/services/mock.ts";
import { createRealAuthService, isAuthResponse } from "../src/features/auth/services/auth.ts";
import { createAuthSession, canAccessProfile } from "../src/features/auth/session.ts";
import { readFragmentToken, passwordError, usernameError, nameError } from "../src/features/auth/utils/validation.ts";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "../src/features/auth/AuthProvider.tsx";
import { ProtectedRoute } from "../src/features/auth/components/RouteGuards.tsx";

const ack = value => typeof value?.message === "string";
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const success = data => ({ success: true, data, error: null });
const failure = code => ({ success: false, data: null, error: { code, message: "Server wording" } });

test("client resolves /api once and never sends cookies or follows redirects", async () => {
  const client = createApiClient("http://localhost:3000/api", undefined, async (url, options) => {
    assert.equal(url.href, "http://localhost:3000/api/auth/me");
    assert.equal(options.headers.get("Authorization"), "Bearer synthetic");
    assert.equal(options.credentials, "omit");
    assert.equal(options.redirect, "error");
    return json(success({ message: "OK" }));
  });
  assert.deepEqual(await client.request("/api/auth/me", { accessToken: "synthetic", status: 200, validate: ack }), { message: "OK" });
  await assert.rejects(client.request("https://external.invalid/api/me", { status: 200, validate: ack }), TransportError);
});

test("public requests omit auth; 204 is not parsed", async () => {
  const client = createApiClient("http://localhost:3000/api", undefined, async (_url, options) => {
    assert.equal(options.headers.has("Authorization"), false);
    return new Response(null, { status: 204 });
  });
  assert.equal(await client.request("/api/auth/logout", { status: 204, validate: value => value === undefined }), undefined);
});

test("401 invalidates, ordinary 403 does not, unverified 403 invalidates", async () => {
  for (const [status, code, expected] of [[401, ERROR_CODES.UNAUTHORIZED, 1], [403, ERROR_CODES.FORBIDDEN, 0], [403, ERROR_CODES.EMAIL_NOT_VERIFIED, 1]]) {
    const invalidations = [];
    const client = createApiClient("http://localhost:3000/api", token => invalidations.push(token), async () => json(failure(code), status));
    await assert.rejects(client.request("/api/auth/me", { accessToken: "synthetic", status: 200, validate: ack }), ApiRequestError);
    assert.equal(invalidations.length, expected);
  }
});

test("network, malformed data and API errors stay distinct", async () => {
  const network = createApiClient("http://localhost:3000/api", undefined, async () => { throw new TypeError(); });
  await assert.rejects(network.request("/api/auth/me", { status: 200, validate: ack }), error => error.kind === "network");
  const malformed = createApiClient("http://localhost:3000/api", undefined, async () => json(success({ wrong: true })));
  await assert.rejects(malformed.request("/api/auth/me", { status: 200, validate: ack }), error => error.kind === "malformed");
  assert.match(errorMessage(new ApiRequestError(401, { code: ERROR_CODES.INVALID_CREDENTIALS, message: "Ignore this wording" })), /don't match/);
});

const credentials = { username: "demo", password: "DemoPassword123" };
const registration = { ...credentials, username: "new_user", email: "new@example.invalid", firstName: "Test", lastName: "Person" };

test("mock login/me/logout share real contracts and sessions are memory-only", async () => {
  const service = createMockAuthService(0);
  const session = createAuthSession(service);
  try {
    assert.equal(canAccessProfile(session.getSnapshot()), false);
    assert.equal(await session.login(credentials), true);
    assert.equal(canAccessProfile(session.getSnapshot()), true);
    await session.refreshUser();
    assert.equal(session.getSnapshot().user.username, "demo");
    assert.equal(createAuthSession(service).getSnapshot().accessToken, null);
    assert.equal(await session.logout(), true);
    assert.deepEqual(session.getSnapshot(), { status: "unauthenticated", user: null, accessToken: null });
  } finally { session.clearSession(); }
});

test("logout clears locally even when server revocation fails", async () => {
  const service = createMockAuthService(0);
  const session = createAuthSession({ ...service, logout: async () => { throw new TransportError("network"); } });
  try {
    await session.login(credentials);
    assert.equal(await session.logout(), false);
    assert.equal(session.getSnapshot().accessToken, null);
  } finally { session.clearSession(); }
});

test("late login cannot restore a session cleared while the request was pending", async () => {
  const service = createMockAuthService(0);
  const response = await service.login(credentials);
  let resolveLogin;
  const session = createAuthSession({ ...service, login: () => new Promise(resolve => { resolveLogin = resolve; }) });
  const pending = session.login(credentials);
  session.clearSession();
  resolveLogin(response);
  assert.equal(await pending, false);
  assert.equal(session.getSnapshot().status, "unauthenticated");
});

test("late me errors cannot clear a newer session; ordinary 403 preserves it", async () => {
  const service = createMockAuthService(0);
  const response = await service.login(credentials);
  let rejectMe;
  const session = createAuthSession({ ...service, me: () => new Promise((_resolve, reject) => { rejectMe = reject; }) });
  try {
    session.setSession(response);
    const pending = session.refreshUser();
    session.setSession({ ...response, accessToken: "new-development-token" });
    rejectMe(new ApiRequestError(401, { code: ERROR_CODES.UNAUTHORIZED, message: "Expired" }));
    await assert.rejects(pending);
    assert.equal(session.getSnapshot().accessToken, "new-development-token");
    session.invalidate(response.accessToken);
    assert.equal(canAccessProfile(session.getSnapshot()), true);
  } finally { session.clearSession(); }
});

test("session expiry removes access without persistence or refresh tokens", async () => {
  const response = await createMockAuthService(0).login(credentials);
  const session = createAuthSession(createMockAuthService(0));
  const now = Date.now;
  try {
    session.setSession(response);
    Date.now = () => now() + 901000;
    session.expireIfNeeded();
    assert.equal(session.getSnapshot().accessToken, null);
  } finally { Date.now = now; session.clearSession(); }
});

test("real protected route renders content only with a session", async () => {
  const service = createMockAuthService(0);
  const session = createAuthSession(service);
  const render = () => renderToString(createElement(AuthProvider, { service, session },
    createElement(MemoryRouter, { initialEntries: ["/profile"] },
      createElement(Routes, null, createElement(Route, { element: createElement(ProtectedRoute) },
        createElement(Route, { path: "/profile", element: createElement("p", null, "Protected content") }))))));
  try {
    assert(!render().includes("Protected content"));
    await session.login(credentials);
    assert(render().includes("Protected content"));
    await session.logout();
    assert(!render().includes("Protected content"));
  } finally { session.clearSession(); }
});

test("verify and reset tokens are removed immediately without entering history state", () => {
  for (const pathname of ["/verify-email", "/reset-password"]) {
    const calls = [];
    const history = { state: { safe: true }, replaceState: (...args) => calls.push(args) };
    const token = "a".repeat(64);
    assert.deepEqual(readFragmentToken({ pathname, hash: `#token=${token}`, search: "" }, history), { path: pathname, token });
    assert.deepEqual(calls, [[{ safe: true }, "", pathname]]);
    assert.equal(readFragmentToken({ pathname, hash: "#token=broken", search: "" }, history).token, null);
    assert.equal(readFragmentToken({ pathname, hash: `#token=${token}&token=${token}`, search: "" }, history).token, null);
  }
});

test("mock registration and login expose required failures by code", async () => {
  const service = createMockAuthService(0);
  assert.match((await service.register(registration)).message, /email/);
  for (const [request, code] of [
    [{ ...registration, email: "taken@example.invalid" }, ERROR_CODES.EMAIL_ALREADY_EXISTS],
    [{ ...registration, username: "taken" }, ERROR_CODES.USERNAME_ALREADY_EXISTS],
    [{ ...registration, username: "invalid" }, ERROR_CODES.VALIDATION_ERROR],
    [{ ...registration, username: "common" }, ERROR_CODES.PASSWORD_TOO_COMMON],
  ]) await assert.rejects(service.register(request), error => error.error.code === code);
  await assert.rejects(service.login({ ...credentials, password: "wrong" }), error => error.error.code === ERROR_CODES.INVALID_CREDENTIALS);
  await assert.rejects(service.login({ ...credentials, username: "unverified" }), error => error.error.code === ERROR_CODES.EMAIL_NOT_VERIFIED);
  await assert.rejects(service.login({ ...credentials, username: "limited" }), error => error.error.code === ERROR_CODES.RATE_LIMITED);
  await assert.rejects(service.login({ ...credentials, username: "offline" }), error => error.kind === "network");
});

test("mock verify/reset are one-use; recovery acknowledgement is generic", async () => {
  const service = createMockAuthService(0);
  const verification = { token: "a".repeat(64) };
  assert.match((await service.verifyEmail(verification)).message, /verified/);
  await assert.rejects(service.verifyEmail(verification), error => error.error.code === ERROR_CODES.INVALID_VERIFICATION_TOKEN);
  await assert.rejects(service.verifyEmail({ token: "0".repeat(64) }), error => error.error.code === ERROR_CODES.INVALID_VERIFICATION_TOKEN);
  const reset = { token: "b".repeat(64), password: "NewPassword123" };
  assert.match((await service.resetPassword(reset)).message, /reset/);
  await assert.rejects(service.resetPassword(reset), error => error.error.code === ERROR_CODES.INVALID_RESET_TOKEN);
  assert.deepEqual(await service.forgotPassword({ email: "demo@example.invalid" }), await service.forgotPassword({ email: "unknown@example.invalid" }));
  assert.deepEqual(await service.resendVerification({ email: "demo@example.invalid" }), await service.resendVerification({ email: "unknown@example.invalid" }));
});

test("real service validates shared responses and uses bearer only on me/logout", async () => {
  const response = await createMockAuthService(0).login(credentials);
  assert(isAuthResponse(response));
  assert(!isAuthResponse({ ...response, expiresIn: -1 }));
  assert(!isAuthResponse({ ...response, user: { ...response.user, emailVerified: false } }));
  const calls = [];
  const client = createApiClient("http://localhost:3000/api", undefined, async (url, options) => {
    calls.push({ url, options });
    if (url.pathname.endsWith('/logout')) return new Response(null, { status: 204 });
    const data = url.pathname.endsWith('/login') ? response : url.pathname.endsWith('/me') ? response.user : { message: "OK" };
    return json(success(data), url.pathname.endsWith('/register') ? 201 : 200);
  });
  const service = createRealAuthService(client);
  await service.register(registration);
  await service.login(credentials);
  await service.verifyEmail({ token: "a".repeat(64) });
  await service.resendVerification({ email: registration.email });
  await service.forgotPassword({ email: registration.email });
  await service.resetPassword({ token: "b".repeat(64), password: credentials.password });
  await service.me("synthetic");
  await service.logout("synthetic");
  for (const [index, call] of calls.entries()) assert.equal(call.options.headers.has("Authorization"), index >= 6);
  assert.equal(JSON.parse(calls[0].options.body).confirmPassword, undefined);
});

test("form validators follow structural rules without a client denylist", () => {
  assert.equal(passwordError("LongEnough123"), undefined);
  assert(passwordError("short1"));
  assert(passwordError("lettersbutnonumbers"));
  assert(usernameError("search"));
  assert.equal(usernameError("new_user"), undefined);
  assert(nameError("\u0000Name"));
});