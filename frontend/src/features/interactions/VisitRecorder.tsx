import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { ErrorNotice } from "../auth/components/Form";
import { useInteractions } from "./InteractionProvider";

export default function VisitRecorder({ id, navigationKey, requests }: { id: string; navigationKey: string; requests: Map<string, Promise<unknown>> }) {
  const { accessToken, user } = useAuth();
  const { service } = useInteractions();
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    let active = true;
    if (accessToken && user?.id !== id) {
      const key = `${navigationKey}:${accessToken}:${id}`;
      let request = requests.get(key);
      if (!request) { request = service.visit(id, accessToken); requests.set(key, request); }
      void request.catch(cause => { if (active) setError(cause); });
    }
    return () => { active = false; };
  }, [service, id, accessToken, user?.id, navigationKey, requests]);
  return error ? <div><p>Your visit could not be confirmed. It may have been recorded; it will not be retried automatically.</p><ErrorNotice error={error} /></div> : null;
}
