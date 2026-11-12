import { useEffect, useRef, useState } from "react";
import type { LikeStatus } from "@matcha/shared";
import { ERROR_CODES } from "@matcha/shared";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { ErrorNotice } from "../auth/components/Form";
import { ApiRequestError } from "../../services/api/client";
import { useInteractions } from "./InteractionProvider";

export default function ProfileActions({ id, username, relationship, onRelationship, onReload }: { id: string; username: string; relationship?: LikeStatus; onRelationship?: (status: LikeStatus) => void; onReload: () => void }) {
  const { accessToken, user } = useAuth();
  const { service, blocked, rememberBlock, forgetBlock, changed } = useInteractions();
  const isBlocked = blocked.some(target => target.id === id);
  const [confirm, setConfirm] = useState<"block" | "report" | null>(null);
  const [details, setDetails] = useState("");
  const [validation, setValidation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [message, setMessage] = useState("");
  const locked = useRef(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  if (user?.id === id) return null;
  async function run(action: () => Promise<void>) {
    if (!accessToken || locked.current) return;
    locked.current = true; setBusy(true); setError(null); setMessage("");
    try { await action(); } catch (cause) { if (active.current) setError(cause); }
    finally { locked.current = false; if (active.current) setBusy(false); }
  }
  const eligibility = error instanceof ApiRequestError && (error.error.code === ERROR_CODES.PROFILE_INCOMPLETE || error.error.code === ERROR_CODES.PROFILE_PICTURE_REQUIRED);
  return <section className="interaction-actions" aria-label="Profile actions" aria-busy={busy}>
    <ErrorNotice error={error} />
    {eligibility && <p><Link to="/profile">Complete your profile</Link>{" or "}<Link to="/profile/pictures">manage your main photo</Link> before liking.</p>}
    {error instanceof ApiRequestError && [ERROR_CODES.ALREADY_LIKED, ERROR_CODES.LIKE_NOT_FOUND, ERROR_CODES.USER_BLOCKED, ERROR_CODES.PROFILE_NOT_FOUND].some(code => code === error.error.code) && <button type="button" className="secondary" onClick={onReload}>Refresh profile</button>}
    {message && <p role="status" className="notice success">{message}</p>}
    {isBlocked ? <><p>You blocked this profile. Likes and the connection were removed.</p><div className="action-row"><button type="button" className="secondary" disabled={busy} onClick={() => void run(async () => { await service.unblock(id, accessToken!); forgetBlock(id); if (active.current) onReload(); })}>Unblock</button><button type="button" className="secondary" disabled={busy} onClick={() => { setConfirm("report"); setValidation(""); }}>Report fake profile</button></div></> : <div className="action-row">
      {relationship && <button type="button" className="primary compact" disabled={busy} onClick={() => void run(async () => {
        const status = await (relationship.likedByMe ? service.unlike(id, accessToken!) : service.like(id, accessToken!));
        changed();
        if (active.current) { onRelationship?.(status); setMessage(status.isConnected ? "You are now connected." : status.likedByMe ? "Profile liked." : "Like removed."); }
      })}>{relationship.likedByMe ? "Unlike" : "Like"}</button>}
      <button type="button" className="secondary danger" disabled={busy} onClick={() => { setConfirm("block"); setValidation(""); }}>Block</button>
      <button type="button" className="secondary" disabled={busy} onClick={() => { setConfirm("report"); setValidation(""); }}>Report fake profile</button>
    </div>}
    {confirm === "block" && !isBlocked && <div className="interaction-confirm" role="group" aria-label="Confirm blocking"><h2>Block @{username}?</h2><p>This removes your likes and connection. Unblocking does not restore them.</p><div className="action-row"><button type="button" className="secondary" disabled={busy} onClick={() => setConfirm(null)}>Cancel</button><button type="button" className="secondary danger" disabled={busy} onClick={() => void run(async () => { await service.block(id, accessToken!); rememberBlock(id, username); if (active.current) setConfirm(null); })}>Confirm block</button></div></div>}
    {confirm === "report" && <form className="interaction-confirm" onSubmit={event => {
      event.preventDefault(); const trimmed = details.trim();
      if (!trimmed || [...trimmed].length > 2000) { setValidation("Explain why this profile appears fake in 1 to 2,000 characters."); return; }
      void run(async () => { await service.report(id, { reason: "fake_account", details: trimmed }, accessToken!); if (active.current) { setConfirm(null); setDetails(""); setMessage("Report sent. Reporting does not automatically block this profile."); } });
    }}><h2>Report fake profile</h2><div className="field"><label htmlFor="report-details">Why does this profile appear fake?</label><textarea id="report-details" rows={4} value={details} disabled={busy} onChange={event => setDetails(event.target.value)} aria-invalid={Boolean(validation)} aria-describedby="report-error" /><p id="report-error" className="field-error">{validation}</p></div><div className="action-row"><button type="button" className="secondary" disabled={busy} onClick={() => setConfirm(null)}>Cancel report</button><button type="submit" className="primary compact" disabled={busy}>Send report</button></div></form>}
  </section>;
}
