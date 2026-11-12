import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";
import { useAuth } from "../auth/AuthProvider";
import type { ProfileService } from "../profile/service";
import { createApiClient } from "../../services/api/client";
import { createRealInteractionService } from "./service";
import type { InteractionService } from "./service";

type BlockedTarget = { token: string; id: string; username: string };
const Context = createContext<{ service: InteractionService; blocked: BlockedTarget[]; revision: number; changed: () => void; rememberBlock: (id: string, username: string) => void; forgetBlock: (id: string) => void } | null>(null);
export function InteractionProvider({ service, children }: { service: InteractionService; children: ReactNode }) {
  const { accessToken } = useAuth();
  const [blocked, setBlocked] = useState<BlockedTarget[]>([]);
  const [revision, setRevision] = useState(0);
  const changed = () => setRevision(value => value + 1);
  return <Context.Provider value={{ service, revision, changed, blocked: blocked.filter(target => target.token === accessToken),
    rememberBlock: (id, username) => { if (accessToken) setBlocked(current => [...current.filter(target => target.id !== id || target.token !== accessToken), { id, username, token: accessToken }]); changed(); },
    forgetBlock: id => { setBlocked(current => current.filter(target => target.id !== id || target.token !== accessToken)); changed(); } }}>{children}</Context.Provider>;
}
export function useInteractions() {
  const value = useContext(Context);
  if (!value) throw new Error("InteractionProvider is required");
  return value;
}
export async function selectInteractions(profiles: ProfileService, invalidate: (token: string) => void) {
  if (import.meta.env.DEV && import.meta.env.VITE_INTERACTIONS_MOCK === "true" && import.meta.env.VITE_PROFILE_MOCK === "true") {
    const { createMockInteractionBundle } = await import("./mock");
    return createMockInteractionBundle(profiles, import.meta.env.VITE_INTERACTIONS_SCENARIO ?? "eligible");
  }
  return { profiles, service: createRealInteractionService(createApiClient(import.meta.env.VITE_API_URL ?? "http://localhost:3000/api", invalidate)) };
}
