import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../features/auth/AuthProvider";
import { ErrorNotice } from "../features/auth/components/Form";

export default function ProfilePlaceholderPage() {
  const { user, session } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    let active = true;
    void session.refreshUser().catch(cause => { if (active) setError(cause); });
    return () => { active = false; };
  }, [session]);
  async function logout() {
    if (busy) return;
    setBusy(true);
    const revoked = await session.logout();
    navigate("/login", { replace: true, state: { logout: revoked ? "revoked" : "local" } });
  }
  return (
    <section aria-labelledby="profile-title">
      <header className="account-heading"><div><p className="eyebrow">Your account</p><strong>{user?.firstName} &middot; @{user?.username}</strong></div><button className="secondary" disabled={busy} onClick={() => void logout()}>{busy ? "Logging out..." : "Log out"}</button></header>
      <h1 id="profile-title" tabIndex={-1}>Profile coming next</h1>
      <p className="intro">You're signed in, {user?.firstName}. Your account is ready.</p>
      <p>Authentication is working. Creating your profile is the next implementation phase.</p>
      <ErrorNotice error={error} />
    </section>
  );
}
