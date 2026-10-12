import { ERROR_CODES } from "@matcha/shared";
import type { ApiResponse, AuthUser, ErrorCode } from "@matcha/shared";
import { TransportError, unwrap } from "../../../services/api/client";
import type { AuthService } from "./auth";

const syntheticUser: AuthUser = {
  id: "00000000-0000-4000-8000-000000000001",
  username: "demo",
  email: "demo@example.invalid",
  firstName: "Alex",
  lastName: "Demo",
  emailVerified: true,
  profileComplete: false,
};

export function createMockAuthService(delayMs = 250): AuthService {
  let activeToken: string | null = null;
  const usedVerification = new Set<string>();
  const usedReset = new Set<string>();
  const wait = () => new Promise<void>(resolve => setTimeout(resolve, delayMs));
  function fail(code: ErrorCode, status: number): never {
    const envelope: ApiResponse<never> = { success: false, data: null, error: { code, message: "Synthetic development response" } };
    return unwrap<never>(envelope, status);
  }
  function succeed<T>(data: T): T {
    const envelope: ApiResponse<T> = { success: true, data, error: null };
    return unwrap(envelope);
  }
  async function scenario(value: string) {
    await wait();
    const marker = value.split("@")[0];
    if (marker === "offline") throw new TransportError("network");
    if (marker === "limited") fail(ERROR_CODES.RATE_LIMITED, 429);
    if (marker === "malformed") throw new TransportError("malformed");
  }
  const generic = { message: "If this email is eligible, you will receive an email shortly." };
  return {
    async register(body) {
      await scenario(body.username);
      if (body.email === "taken@example.invalid") fail(ERROR_CODES.EMAIL_ALREADY_EXISTS, 409);
      if (body.username === "taken") fail(ERROR_CODES.USERNAME_ALREADY_EXISTS, 409);
      if (body.username === "invalid") fail(ERROR_CODES.VALIDATION_ERROR, 422);
      if (body.username === "common") fail(ERROR_CODES.PASSWORD_TOO_COMMON, 422);
      return succeed({ message: "Check your email to verify your account before logging in." });
    },
    async login(body) {
      await scenario(body.username);
      if (body.username === "unverified") fail(ERROR_CODES.EMAIL_NOT_VERIFIED, 403);
      if (body.username !== "demo" || body.password !== "DemoPassword123") fail(ERROR_CODES.INVALID_CREDENTIALS, 401);
      activeToken = "matcha-development-opaque-token";
      return succeed({ user: { ...syntheticUser }, accessToken: activeToken, tokenType: "Bearer", expiresIn: 900 });
    },
    async verifyEmail({ token }) {
      await wait();
      if (token !== "a".repeat(64) || usedVerification.has(token)) fail(ERROR_CODES.INVALID_VERIFICATION_TOKEN, 400);
      usedVerification.add(token);
      return succeed({ message: "Your email is verified. You can now log in." });
    },
    async resendVerification({ email }) { await scenario(email); return succeed({ ...generic }); },
    async forgotPassword({ email }) { await scenario(email); return succeed({ ...generic }); },
    async resetPassword({ token }) {
      await wait();
      if (token !== "b".repeat(64) || usedReset.has(token)) fail(ERROR_CODES.INVALID_RESET_TOKEN, 400);
      usedReset.add(token);
      activeToken = null;
      return succeed({ message: "Your password has been reset. Please log in again." });
    },
    async me(token) {
      await wait();
      if (!activeToken || token !== activeToken) fail(ERROR_CODES.UNAUTHORIZED, 401);
      return succeed({ ...syntheticUser });
    },
    async logout(token) {
      await wait();
      if (!activeToken || token !== activeToken) fail(ERROR_CODES.UNAUTHORIZED, 401);
      activeToken = null;
    },
  };
}