import { useEffect } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";

export default function AuthLayout() {
  const { pathname } = useLocation();
  useEffect(() => {
    const heading = document.querySelector<HTMLHeadingElement>("h1");
    if (heading) { document.title = `${heading.textContent} | Matcha`; heading.focus(); }
  }, [pathname]);
  return (
    <div className="auth-shell">
      <header className="site-header">
        <Link className="wordmark" to="/login" aria-label="Matcha home">matcha<span aria-hidden="true">.</span></Link>
        <span className="header-note">A little closer.</span>
      </header>
      <main id="main" className="auth-main"><Outlet /></main>
      <footer className="site-footer"><span>Matcha / 42 &amp; 1337</span><span>Make room for connection.</span></footer>
    </div>
  );
}