import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { PaginatedData, PublicProfile } from "@matcha/shared";
import { useAuth } from "../features/auth/AuthProvider";
import { ErrorNotice } from "../features/auth/components/Form";
import { ProfileImage } from "../features/profile/components";
import { useInteractions } from "../features/interactions/InteractionProvider";

const titles = { likes: "Who liked you", views: "Profile visitors", connections: "Connections" };
type Entry = { key: string; profile: PublicProfile; date: string };
export default function RelationshipsPage({ kind }: { kind: keyof typeof titles }) {
  const { accessToken } = useAuth();
  const { service, blocked, revision } = useInteractions();
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ key: string; data: PaginatedData<Entry> | null; error: unknown }>({ key: "", data: null, error: null });
  const key = `${kind}:${page}:${accessToken}:${attempt}:${revision}`;
  useEffect(() => {
    let active = true;
    setState({ key, data: null, error: null });
    if (accessToken) void (async () => {
      const query = { page, limit: 20 };
      let data: PaginatedData<Entry>;
      if (kind === "likes") { const result = await service.likes(query, accessToken); data = { ...result, items: result.items.map(item => ({ key: item.id, profile: item.actor, date: item.createdAt })) }; }
      else if (kind === "views") { const result = await service.views(query, accessToken); data = { ...result, items: result.items.map(item => ({ key: item.id, profile: item.viewer, date: item.viewedAt })) }; }
      else { const result = await service.connections(query, accessToken); data = { ...result, items: result.items.map(item => ({ key: item.user.id, profile: item.user, date: item.connectedAt })) }; }
      if (active) setState({ key, data, error: null });
    })().catch(error => { if (active) setState({ key, data: null, error }); });
    return () => { active = false; };
  }, [service, accessToken, kind, page, key]);
  const data = state.key === key ? state.data : null;
  return <><h1 tabIndex={-1}>{titles[kind]}</h1>
    {kind === "connections" && blocked.length > 0 && <section className="interaction-blocks"><h2>Blocked in this session</h2><ul>{blocked.map(target => <li key={target.id}><Link to={`/profiles/${encodeURIComponent(target.username)}`} state={{ userId: target.id }}>@{target.username}</Link></li>)}</ul></section>}
    {state.key === key && state.error ? <><ErrorNotice error={state.error} /><button className="secondary" onClick={() => setAttempt(value => value + 1)}>Try again</button></> : !data ? <p role="status">Loading {titles[kind].toLowerCase()}...</p> : <>
      <p role="status">{data.pagination.total} {kind === "connections" ? data.pagination.total === 1 ? "connection" : "connections" : kind === "likes" ? data.pagination.total === 1 ? "like" : "likes" : data.pagination.total === 1 ? "visit" : "visits"}</p>
      {!data.items.length ? <p className="profile-empty">{kind === "connections" ? "No connections yet." : kind === "likes" ? "No likes received yet." : "No profile visits yet."}</p> : <ul className="relationship-cards">{data.items.map(item => {
        const main = item.profile.pictures.find(picture => picture.isMain);
        return <li key={item.key}>{main ? <div className="relationship-photo"><ProfileImage picture={main} alt={`${item.profile.firstName}'s main photo`} /></div> : <div className="relationship-photo photo-fallback">No photo</div>}<div><h2><Link to={`/profiles/${encodeURIComponent(item.profile.username)}`} state={{ userId: item.profile.id }}>{item.profile.firstName}{item.profile.age !== null && `, ${item.profile.age}`}</Link></h2><p>@{item.profile.username}</p><p>{item.profile.location ? [item.profile.location.city, item.profile.location.neighborhood].filter(Boolean).join(" / ") : "Location not shared"}</p><time dateTime={item.date}>{new Date(item.date).toLocaleString()}</time></div></li>;
      })}</ul>}
      <nav className="relationship-pagination" aria-label="Relationship pages"><button className="secondary" disabled={data.pagination.page <= 1} onClick={() => setPage(data.pagination.page - 1)}>Previous</button><span>Page {data.pagination.page} of {Math.max(1, data.pagination.totalPages)}</span><button className="secondary" disabled={data.pagination.page >= data.pagination.totalPages} onClick={() => setPage(data.pagination.page + 1)}>Next</button></nav>
    </>}
  </>;
}
