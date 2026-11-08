import { useEffect, useRef, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import type { PublicProfile } from "@matcha/shared";
import { useAuth } from "../features/auth/AuthProvider";
import { useProfileService } from "../features/profile/ProfileProvider";
import { LoadState, ProfilePresentation } from "../features/profile/components";
import { useInteractions } from "../features/interactions/InteractionProvider";
import ProfileActions from "../features/interactions/ProfileActions";
import VisitRecorder from "../features/interactions/VisitRecorder";

export default function PublicProfilePage() {
  const { username = "" } = useParams();
  const { accessToken } = useAuth();
  const service = useProfileService();
  const navigation = useLocation();
  const visits = useRef(new Map<string, Promise<unknown>>());
  const { blocked } = useInteractions();
  const localBlock = blocked.find(target => target.username === username);
  const [result, setResult] = useState<{ key: string; data: PublicProfile | null; error: unknown }>({ key: "", data: null, error: null });
  const [attempt, setAttempt] = useState(0);
  const key = `${username}:${accessToken}:${attempt}`;
  useEffect(() => {
    let active = true;
    setResult({ key, data: null, error: null });
    if (accessToken) void service.publicProfile(username, accessToken).then(data => { if (active) setResult({ key, data, error: null }); }, error => { if (active) setResult({ key, data: null, error }); });
    return () => { active = false; };
  }, [service, username, accessToken, attempt, key]);
  const reload = () => setAttempt(value => value + 1);
  if (localBlock) return <><h1 tabIndex={-1}>Profile blocked</h1><ProfileActions key={`${key}:blocked`} id={localBlock.id} username={username} onReload={reload} /></>;
  if (result.key !== key || !result.data) {
    const knownId: unknown = navigation.state?.userId;
    return <><h1 tabIndex={-1}>Public profile</h1><LoadState loading={!result.error || result.key !== key} error={result.error} retry={reload} />{result.error && typeof knownId === "string" && /^[0-9a-f-]{36}$/i.test(knownId) && <ProfileActions key={key} id={knownId} username={username} onReload={reload} />}</>;
  }
  return <><ProfilePresentation profile={result.data} /><VisitRecorder key={`${navigation.key}:${key}`} id={result.data.id} navigationKey={navigation.key} requests={visits.current} /><ProfileActions key={key} id={result.data.id} username={username} relationship={result.data} onReload={reload} onRelationship={status => setResult(current => current.data && current.key === key ? { ...current, data: { ...current.data, ...status } } : current)} /></>;
}
