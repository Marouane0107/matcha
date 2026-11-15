import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { Notification, PaginatedData } from "@matcha/shared";
import { useAuth } from "../features/auth/AuthProvider";
import { ErrorNotice } from "../features/auth/components/Form";
import { useRealtime } from "../features/realtime/RealtimeProvider";
import { useInteractions } from "../features/interactions/InteractionProvider";

const labels = { LIKE: "liked your profile", PROFILE_VIEW: "visited your profile", MESSAGE: "sent you a message", CONNECTION: "is now connected with you", UNLIKE: "removed a like; your connection ended" };
export default function NotificationsPage() {
  const { accessToken } = useAuth();
  const realtime = useRealtime();
  const { blocked } = useInteractions();
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ key: string; data: PaginatedData<Notification> | null; error: unknown }>({ key: "", data: null, error: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const lock = useRef(false);
  const active = useRef(true);
  const key = `${accessToken}:${page}:${attempt}:${realtime.notificationEpoch}`;
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    let live = true; setState({ key, data: null, error: null });
    if (accessToken) void realtime.service.notifications({ page, limit: 20 }, accessToken).then(data => { if (live) setState({ key, data, error: null }); }, cause => { if (live) setState({ key, data: null, error: cause }); });
    return () => { live = false; };
  }, [accessToken, realtime.service, key, page]);
  async function run(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(null);
    try { await action(); } catch (cause) { if (active.current) setError(cause); } finally { lock.current = false; if (active.current) setBusy(false); }
  }
  const data = state.key === key ? state.data : null;
  const items = data ? [...new Map([...(page === 1 ? realtime.notifications : []), ...data.items].map(item => [item.id, item])).values()].filter(item => !blocked.some(target => target.id === item.actorId)).sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id)) : [];
  return <><h1 tabIndex={-1}>Notifications</h1><p role="status">{realtime.unread} unread{!realtime.online && ". Live updates are disconnected."}</p><ErrorNotice error={realtime.error} />{!realtime.online && <button className="secondary" onClick={realtime.reconnect}>Reconnect</button>}
    <div className="action-row"><button className="secondary" disabled={busy || !realtime.unread} onClick={() => void run(realtime.readAll)}>Mark all as read</button><button className="secondary" onClick={() => { realtime.refresh(); setAttempt(value => value + 1); }}>Refresh notifications</button></div><ErrorNotice error={error} />
    {state.key === key && state.error ? <><ErrorNotice error={state.error} /><button className="secondary" onClick={() => setAttempt(value => value + 1)}>Retry notifications</button></> : !data ? <p role="status">Loading notifications...</p> : <>
      {!items.length && <p>No notifications yet.</p>}
      <ul className="notification-list">{items.map(item => <li key={item.id} className={item.read ? "read" : "unread"}><div><p>{item.actorUsername && item.actorId ? <Link to={item.type === "MESSAGE" ? `/messages/${encodeURIComponent(item.actorId)}` : `/profiles/${encodeURIComponent(item.actorUsername)}`} state={{ userId: item.actorId }}>@{item.actorUsername}</Link> : "Deleted account"} {labels[item.type]}</p><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time></div>{!item.read && <button className="secondary" disabled={busy} onClick={() => void run(() => realtime.read(item.id))}>Mark as read<span className="sr-only"> notification from {item.actorUsername ?? "deleted account"}</span></button>}</li>)}</ul>
      <nav className="relationship-pagination" aria-label="Notification pages"><button className="secondary" disabled={data.pagination.page <= 1} onClick={() => setPage(data.pagination.page - 1)}>Previous notifications</button><span>Page {data.pagination.page} of {Math.max(1, data.pagination.totalPages)}</span><button className="secondary" disabled={data.pagination.page >= data.pagination.totalPages} onClick={() => setPage(data.pagination.page + 1)}>Next notifications</button></nav>
    </>}
  </>;
}
