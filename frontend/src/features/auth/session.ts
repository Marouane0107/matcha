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

const STORAGE_KEY = "matcha.session";

interface StoredSession {
  user: AuthUser;
  accessToken: string;
  expiresAt: number;
}

function loadStoredSession(): StoredSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<StoredSession>;
    const user = value?.user as AuthUser | undefined;
    if (value && typeof value.accessToken === "string" && value.accessToken.length > 0 && user && typeof user.id === "string" && typeof user.username === "string" && typeof value.expiresAt === "number" && value.expiresAt > Date.now()) {
      return { user, accessToken: value.accessToken, expiresAt: value.expiresAt };
    }
    window.localStorage.removeItem(STORAGE_KEY);
  } catch { /* malformed or unavailable storage */ }
  return null;
}

function persistSession(value: StoredSession | null) {
  if (typeof window === "undefined") return;
  try {
    if (value) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch { /* storage may be unavailable */ }
}

export function createAuthSession(service: AuthService) {
  const stored = loadStoredSession();
  let state: AuthState = stored ? { status: "authenticated", user: stored.user, accessToken: stored.accessToken } : { status: "unauthenticated", user: null, accessToken: null };
  let generation = 0;
  let expiresAt = stored?.expiresAt ?? 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();
  function publish(next: AuthState) { state = next; listeners.forEach(listener => listener()); }
  function clearSession() {
    generation++;
    clearTimeout(timer);
    expiresAt = 0;
    persistSession(null);
    publish({ status: "unauthenticated", user: null, accessToken: null });
  }
  function setSession(response: AuthResponse) {
    generation++;
    clearTimeout(timer);
    expiresAt = Date.now() + response.expiresIn * 1000;
    persistSession({ user: response.user, accessToken: response.accessToken, expiresAt });
    publish({ status: "authenticated", user: response.user, accessToken: response.accessToken });
    timer = setTimeout(clearSession, response.expiresIn * 1000);
  }
  if (stored) timer = setTimeout(clearSession, Math.max(0, stored.expiresAt - Date.now()));
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
