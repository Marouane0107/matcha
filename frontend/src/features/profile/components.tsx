import { useEffect, useState } from "react";
import type { Picture, PublicProfile, UserProfile } from "@matcha/shared";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { ErrorNotice } from "../auth/components/Form";
import { useProfileService } from "./ProfileProvider";
import { ageFromDate, genders, preferences } from "./validation";

export function useOwnerProfile() {
  const service = useProfileService();
  const { accessToken } = useAuth();
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<{ token: string | null; data: UserProfile | null; error: unknown; loading: boolean }>({ token: null, data: null, error: null, loading: true });
  useEffect(() => {
    let active = true;
    setState({ token: accessToken, data: null, error: null, loading: true });
    if (accessToken) void service.me(accessToken).then(data => { if (active) setState({ token: accessToken, data, error: null, loading: false }); }, error => { if (active) setState({ token: accessToken, data: null, error, loading: false }); });
    return () => { active = false; };
  }, [service, accessToken, version]);
  return { data: state.token === accessToken ? state.data : null, error: state.error, loading: state.loading, reload: () => setVersion(value => value + 1) };
}

export function LoadState({ loading, error, retry }: { loading: boolean; error: unknown; retry: () => void }) {
  return loading ? <div className="profile-loading" role="status"><span className="loading-line" />Loading your profile...</div> : <div className="profile-empty"><h2>We couldn't load this profile</h2><ErrorNotice error={error} /><button className="secondary" onClick={retry}>Try again</button></div>;
}

export function ProfileImage({ picture, alt }: { picture: Picture; alt: string }) {
  const service = useProfileService();
  const { accessToken } = useAuth();
  const [image, setImage] = useState<{ key: string; url: string } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const key = `${picture.id}:${accessToken}`;
  useEffect(() => {
    let active = true;
    let objectUrl: string | undefined;
    setError(null);
    setImage(null);
    if (accessToken) void service.image(picture.id, accessToken).then(blob => {
      if (!active) return;
      objectUrl = URL.createObjectURL(blob);
      setImage({ key, url: objectUrl });
    }, cause => { if (active) setError(cause); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [service, picture.id, accessToken, key, attempt]);
  if (error) return <div className="photo-fallback"><span>Photo unavailable</span><button className="secondary" onClick={() => setAttempt(value => value + 1)}>Retry photo</button></div>;
  return image?.key === key ? <img src={image.url} alt={alt} onError={() => setError(new Error("image"))} /> : <div className="photo-fallback" role="status">Loading photo...</div>;
}

export function ProfilePresentation({ profile, owner = false }: { profile: UserProfile | PublicProfile; owner?: boolean }) {
  const age = "dateOfBirth" in profile ? ageFromDate(profile.dateOfBirth) : profile.age;
  const main = profile.pictures.find(picture => picture.isMain);
  const others = profile.pictures.filter(picture => !picture.isMain).sort((left, right) => left.position - right.position);
  return <div className="profile-columns">
    <div className="profile-visual">
      <div className="portrait">{main ? <ProfileImage picture={main} alt={`${profile.firstName || profile.username}'s main profile photo`} /> : <div className="portrait-empty"><span aria-hidden="true" className="initials">{profile.firstName.slice(0, 1) || "?"}</span><strong>No photo yet</strong>{owner && <Link to="/profile/pictures">Add your first photo</Link>}</div>}</div>
      {others.length > 0 && <div className="profile-thumbnails">{others.map((picture, index) => <div key={picture.id}><ProfileImage picture={picture} alt={`Profile photo ${index + 2}`} /></div>)}</div>}
      {owner && <Link className="secondary" to="/profile/pictures">Manage photos ({profile.pictures.length}/5)</Link>}
    </div>
    <div className="profile-details">
      <p className="eyebrow">{owner ? "Your profile" : "Meet someone new"}</p>
      <h1 tabIndex={-1}>{profile.firstName || profile.username}{age !== null && age >= 18 && age <= 120 ? <span className="profile-age">, {age}</span> : null}</h1>
      <p className="profile-handle">@{profile.username}</p>
      <p className="location-label">{profile.location ? [profile.location.city, profile.location.neighborhood].filter(Boolean).join(" / ") : "Location not shared"}</p>
      {!owner && <p className={`presence ${profile.isOnline ? "online" : ""}`}>{profile.isOnline ? "Online now" : profile.lastSeen ? `Last seen ${new Date(profile.lastSeen).toLocaleString()}` : "Offline / last seen unavailable"}</p>}
      <section className="profile-section"><h2>A little about {owner ? "you" : profile.firstName || profile.username}</h2><p className="biography">{profile.bio || (owner ? "A few words can be the start of a great conversation. Add your biography when you're ready." : "No biography shared yet.")}</p></section>
      <section className="profile-section"><h2>Interests</h2>{profile.tags.length ? <ul className="tag-list">{profile.tags.map(tag => <li key={tag.id}>#{tag.name}</li>)}</ul> : <p className="muted">No interests selected yet.</p>}</section>
      <dl className="profile-facts">
        {owner && <><div><dt>Full name</dt><dd>{[profile.firstName, profile.lastName].filter(Boolean).join(" ") || "Not provided"}</dd></div><div><dt>Date of birth</dt><dd>{"dateOfBirth" in profile && profile.dateOfBirth || "Not provided"}</dd></div></>}
        <div><dt>Gender</dt><dd>{profile.gender ? genders[profile.gender] : "Not provided"}</dd></div>
        <div><dt>Interested in</dt><dd>{preferences[profile.sexualPreference]}</dd></div>
        <div><dt>Fame rating</dt><dd>{profile.fameRating}<span className="muted"> / 100</span></dd></div>
        {owner && "email" in profile && <div><dt>Verified email</dt><dd>{profile.email || "Not provided"}</dd></div>}
      </dl>
      {!owner && "isConnected" in profile && <section className="profile-section"><h2>Connection</h2><p>{profile.isConnected ? "You are connected." : "You are not connected."}</p><ul className="relationship-list"><li>{profile.likedByMe ? "You like this profile." : "You haven't liked this profile."}</li><li>{profile.hasLikedMe ? "This person likes you." : "No like received."}</li></ul></section>}
      {owner && !profile.location && <p className="notice warning">No location saved. Location settings will be available in the next phase; discovery remains unavailable until your location is saved.</p>}
    </div>
  </div>;
}
