import { useEffect } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";

export default function AuthLayout() {
  const { pathname } = useLocation();
  const account = pathname === "/profile";
  const registering = pathname === "/register";
  useEffect(() => {
    const heading = document.querySelector<HTMLHeadingElement>("h1");
    if (heading) { document.title = `${heading.textContent} | Matcha`; heading.focus(); }
  }, [pathname]);
  return (
    <div className={`auth-shell${account ? " account-shell" : ""}`}>
      <a className="skip-link" href="#main">Skip to main content</a>
      <header className="site-header">
        <Link className="wordmark" to="/login" aria-label="Matcha home">matcha<span aria-hidden="true">.</span></Link>
        {!account && <nav aria-label="Account"><span className="header-note">{registering ? "Already a member?" : "New here?"}</span> <Link className="header-action" to={registering ? "/login" : "/register"}>{registering ? "Sign in" : "Create account"}</Link></nav>}
      </header>
      <main id="main" className="auth-main" tabIndex={-1}>
        {!account && <aside className="brand-panel" aria-label="About Matcha">
          <p className="eyebrow">A little closer. A little more you.</p>
          <h2>Good connections<br />start with something<br /><em>in common.</em></h2>
          <p className="brand-copy">Meet people who share your interests. Find a spark, start a conversation, and see where it goes.</p>
          <div className="brand-photo"><img src="https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=900&q=85" alt="Friends enjoying time together outdoors" /><span>Real people. Shared interests.</span></div>
          <ul className="brand-features"><li>Discover your people</li><li>Mutual likes</li><li>Real conversations</li></ul>
        </aside>}
        <div className="auth-card"><Outlet /></div>
      </main>
      <footer className="site-footer"><span>Matcha &middot; 42/1337 project</span><span>A connection worth making.</span></footer>
    </div>
  );
}
