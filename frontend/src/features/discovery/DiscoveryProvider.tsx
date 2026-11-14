import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import { createApiClient } from "../../services/api/client";
import type { ProfileService } from "../profile/service";
import { createRealDiscoveryService } from "./service";
import type { DiscoveryService } from "./service";

const Context = createContext<DiscoveryService | null>(null);
export function DiscoveryProvider({ service, children }: { service: DiscoveryService; children: ReactNode }) {
  return <Context.Provider value={service}>{children}</Context.Provider>;
}
export function useDiscoveryService() {
  const service = useContext(Context);
  if (!service) throw new Error("DiscoveryProvider is required");
  return service;
}
export async function selectDiscoveryService(profiles: ProfileService, invalidate: (token: string) => void): Promise<DiscoveryService> {
  if (import.meta.env.DEV && import.meta.env.VITE_DISCOVERY_MOCK === "true") {
    const { createMockDiscoveryService } = await import("./mock");
    return createMockDiscoveryService(profiles, import.meta.env.VITE_DISCOVERY_SCENARIO ?? "populated");
  }
  return createRealDiscoveryService(createApiClient(import.meta.env.VITE_API_URL ?? "http://localhost:3000/api", invalidate));
}
