import { ERROR_CODES } from "@matcha/shared";
import type { AuthResponse, AuthUser, LoginRequest } from "@matcha/shared";
import { ApiRequestError } from "../../services/api/client";
import type { AuthService } from "./services/auth";

export interface AuthState {
  status: "loading" | "authenticated" | "unauthenticated";
  user: AuthUser | null;
  accessToken: string | null;
}

export function canAccessProfile(state: AuthState): boolean {
  return state.status === "authenticated" && state.user !== null && state.accessToken !== null;
}

export function createAuthSession(service: AuthService) {
  let state: AuthState = { status: "unauthenticated", user: null, accessToken: null };
  let generation = 0;
  let expiresAt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();
  function publish(next: AuthState) { state = next; listeners.forEach(listener => listener()); }
  function clearSession() {
    generation++;
    clearTimeout(timer);
    expiresAt = 0;
    publish({ status: "unauthenticated", user: null, accessToken: null });
  }
  function setSession(response: AuthResponse) {
    generation++;
    clearTimeout(timer);
    expiresAt = Date.now() + response.expiresIn * 1000;
    publish({ status: "authenticated", user: response.user, accessToken: response.accessToken });
    timer = setTimeout(clearSession, response.expiresIn * 1000);
  }
  function expireIfNeeded() {
    if (expiresAt && Date.now() >= expiresAt) clearSession();
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    setSession,
    clearSession,
    expireIfNeeded,
    invalidate(token: string) { if (state.accessToken === token) clearSession(); },
    async login(request: LoginRequest) {
      const attempt = ++generation;
      publish({ status: "loading", user: null, accessToken: null });
      try {
        const response = await service.login(request);
        if (attempt !== generation) return false;
        setSession(response);
        return true;
      } catch (error) {
        if (attempt === generation) clearSession();
        throw error;
      }
    },
    async refreshUser() {
      expireIfNeeded();
      const token = state.accessToken;
      const attempt = generation;
      if (!token) return;
      try {
        const user = await service.me(token);
        if (attempt !== generation) return;
        if (!user.emailVerified) { clearSession(); return; }
        publish({ ...state, user });
      } catch (error) {
        if (attempt === generation && error instanceof ApiRequestError &&
            (error.status === 401 || error.error.code === ERROR_CODES.EMAIL_NOT_VERIFIED)) clearSession();
        throw error;
      }
    },
    async logout() {
      const token = state.accessToken;
      const attempt = generation;
      let revoked = false;
      try { if (token) { await service.logout(token); revoked = true; } }
      catch { revoked = false; }
      finally { if (attempt === generation || state.accessToken === token) clearSession(); }
      return revoked;
    },
  };
}

export type AuthSession = ReturnType<typeof createAuthSession>;
