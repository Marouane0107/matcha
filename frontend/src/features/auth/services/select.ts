import { createApiClient } from "../../../services/api/client";
import { createRealAuthService } from "./auth";
import type { AuthService } from "./auth";

export async function selectAuthService(invalidate: (token: string) => void): Promise<AuthService> {
  if (import.meta.env.DEV && import.meta.env.VITE_AUTH_MOCK === "true") {
    const { createMockAuthService } = await import("./mock");
    return createMockAuthService();
  }
  return createRealAuthService(createApiClient(import.meta.env.VITE_API_URL ?? "http://localhost:3000/api", invalidate));
}
