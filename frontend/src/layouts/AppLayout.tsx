import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../features/auth/AuthProvider";
import { ErrorNotice, useTask } from "../features/auth/components/Form";

export default function AppLayout() {
  const { user, session } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const task = useTask();
  const [sessionError, setSessionError] = useState<unknown>(null);
  useEffect(() => {
    let active = true;
    void session.refreshUser().catch(error => { if (active) setSessionError(error); });
    return () => { active = false; };
  }, [session]);
  useEffect(() => { document.title = "Your space | Matcha"; document.querySelector<HTMLHeadingElement>("h1")?.focus(); }, [pathname]);
  return <div className="app-shell">
    <a className="skip-link" href="#main">Skip to main content</a>
    <header className="app-header">
      <NavLink className="wordmark" to="/profile" aria-label="Matcha home">matcha<span aria-hidden="true">.</span></NavLink>
      <nav aria-label="Your account"><NavLink to="/profile" end>My profile</NavLink><NavLink to="/account">Account</NavLink></nav>
      <div className="account-controls"><span className="account-name">@{user?.username}</span><button className="secondary" disabled={task.busy} onClick={() => void task.run(async () => { const revoked = await session.logout(); navigate("/login", { replace: true, state: { logout: revoked ? "revoked" : "local" } }); })}>{task.busy ? "Logging out..." : "Log out"}</button></div>
    </header>
    <main id="main" tabIndex={-1} className="app-main"><ErrorNotice error={sessionError} /><ErrorNotice error={task.error} /><Outlet /></main>
    <footer className="site-footer"><span>Matcha &middot; 42/1337 project</span><span>A connection worth making.</span></footer>
  </div>;
}
