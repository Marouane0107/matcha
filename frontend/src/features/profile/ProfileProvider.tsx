import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import { createApiClient } from "../../services/api/client";
import { createRealProfileService } from "./service";
import type { ProfileService } from "./service";

const ProfileContext = createContext<ProfileService | null>(null);
export function ProfileProvider({ service, children }: { service: ProfileService; children: ReactNode }) {
  return <ProfileContext.Provider value={service}>{children}</ProfileContext.Provider>;
}
export function useProfileService() {
  const service = useContext(ProfileContext);
  if (!service) throw new Error("ProfileProvider is required");
  return service;
}
export async function selectProfileService(invalidate: (token: string) => void): Promise<ProfileService> {
  if (import.meta.env.DEV && import.meta.env.VITE_PROFILE_MOCK === "true") {
    const { createMockProfileService } = await import("./mock");
    return createMockProfileService();
  }
  return createRealProfileService(createApiClient(import.meta.env.VITE_API_URL ?? "http://localhost:3000/api", invalidate));
}
