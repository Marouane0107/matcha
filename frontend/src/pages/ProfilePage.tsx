import { Link } from "react-router-dom";
import { useAuth } from "../features/auth/AuthProvider";
import { LoadState, ProfilePresentation, useOwnerProfile } from "../features/profile/components";
import { completionChecklist } from "../features/profile/validation";

export default function ProfilePage() {
  const { user } = useAuth();
  const resource = useOwnerProfile();
  if (!resource.data) return <><h1 tabIndex={-1}>My profile</h1><LoadState loading={resource.loading} error={resource.error} retry={resource.reload} /></>;
  const profile = resource.data;
  const checklist = completionChecklist(profile, Boolean(user?.emailVerified));
  const missing = checklist.filter(item => !item.done);
  return <>
    <div className="page-toolbar"><span className="muted">Your space, your story.</span><div className="action-row"><Link className="secondary" to={`/profiles/${encodeURIComponent(profile.username)}`}>Public view</Link><Link className="primary compact" to="/profile/edit">Edit profile</Link></div></div>
    <ProfilePresentation profile={profile} owner />
    <section className="completion-section" aria-labelledby="completion-title">
      <div><p className="eyebrow">Make a good first impression</p><h2 id="completion-title">{profile.profileComplete ? "Ready for discovery" : "A little more to your story"}</h2><p>{profile.profileComplete ? "Your profile is complete and eligible for discovery." : "Your profile is not yet eligible for discovery."}</p><p className="muted">{checklist.length - missing.length} of {checklist.length} required details present</p></div>
      <ul className="completion-list">{checklist.map(item => <li key={item.label}><span className={item.done ? "check-done" : "check-missing"} aria-label={item.done ? "Complete" : "Missing"}>{item.done ? "✓" : "○"}</span>{!item.done && item.href ? <Link to={item.href}>{item.label}</Link> : <span>{item.label}{!item.done && !item.href ? " (location phase)" : ""}</span>}</li>)}</ul>
      {!profile.profileComplete && missing.length === 0 && <p className="notice warning">All listed details are present. The server still marks your profile incomplete. <button className="text-button" onClick={resource.reload}>Check again</button></p>}
    </section>
  </>;
}
