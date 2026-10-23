import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import type { PublicProfile } from "@matcha/shared";
import { useAuth } from "../features/auth/AuthProvider";
import { useProfileService } from "../features/profile/ProfileProvider";
import { LoadState, ProfilePresentation } from "../features/profile/components";

export default function PublicProfilePage() {
  const { username = "" } = useParams();
  const { accessToken } = useAuth();
  const service = useProfileService();
  const [result, setResult] = useState<{ key: string; data: PublicProfile | null; error: unknown }>({ key: "", data: null, error: null });
  const [attempt, setAttempt] = useState(0);
  const key = `${username}:${accessToken}`;
  useEffect(() => {
    let active = true;
    setResult({ key, data: null, error: null });
    if (accessToken) void service.publicProfile(username, accessToken).then(data => { if (active) setResult({ key, data, error: null }); }, error => { if (active) setResult({ key, data: null, error }); });
    return () => { active = false; };
  }, [service, username, accessToken, attempt, key]);
  if (result.key !== key || !result.data) return <><h1 tabIndex={-1}>Public profile</h1><LoadState loading={!result.error || result.key !== key} error={result.error} retry={() => setAttempt(value => value + 1)} /></>;
  return <ProfilePresentation profile={result.data} />;
}
