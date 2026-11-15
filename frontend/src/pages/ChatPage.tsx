import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { ChatMessage, ConversationPreview, PaginatedData, SendMessagePayload } from "@matcha/shared";
import { ERROR_CODES } from "@matcha/shared";
import { useAuth } from "../features/auth/AuthProvider";
import { ErrorNotice } from "../features/auth/components/Form";
import { useRealtime } from "../features/realtime/RealtimeProvider";
import { isUuid, mergeMessages, messageError } from "../features/realtime/service";
import { ApiRequestError } from "../services/api/client";

export default function ChatPage() {
  const { userId = "" } = useParams();
  const { accessToken, user } = useAuth();
  const realtime = useRealtime();
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [list, setList] = useState<{ key: string; data: PaginatedData<ConversationPreview> | null; error: unknown }>({ key: "", data: null, error: null });
  const listKey = `${page}:${realtime.epoch}:${attempt}:${accessToken}:${realtime.messages.at(-1)?.id ?? ""}`;
  useEffect(() => {
    let active = true; setList({ key: listKey, data: null, error: null });
    if (accessToken) void realtime.service.conversations({ page, limit: 20 }, accessToken).then(data => { if (active) setList({ key: listKey, data, error: null }); }, error => { if (active) setList({ key: listKey, data: null, error }); });
    return () => { active = false; };
  }, [realtime.service, accessToken, page, listKey]);
  const listData = list.key === listKey ? list.data : null;
  return <><h1 tabIndex={-1}>Messages</h1><p className="muted" role="status">{realtime.online ? "Connected" : "Connection lost. Messaging is paused until reconnected."}</p><ErrorNotice error={realtime.error} />{!realtime.online && <button className="secondary" onClick={realtime.reconnect}>Reconnect</button>}
    <div className="chat-layout"><aside aria-label="Conversations"><h2>Conversations</h2>
      {list.key === listKey && list.error ? <><ErrorNotice error={list.error} /><button className="secondary" onClick={() => setAttempt(value => value + 1)}>Retry conversations</button></> : !listData ? <p role="status">Loading conversations...</p> : <>
        {!listData.items.length && <p>No conversations yet. Messaging is available for mutual connections.</p>}
        <ul className="conversation-list">{listData.items.filter(item => !realtime.denied.includes(item.user.id)).map(item => <li key={item.user.id}><Link to={`/messages/${item.user.id}`} aria-current={userId === item.user.id ? "page" : undefined}>{item.user.firstName} <span className="muted">@{item.user.username}</span></Link><p>{item.lastMessage?.content ?? "No messages yet"}</p><p className="hint">{(realtime.presence[item.user.id]?.isOnline ?? item.user.isOnline) ? "Online" : "Offline"}</p></li>)}</ul>
        <div className="relationship-pagination"><button className="secondary" disabled={listData.pagination.page <= 1} onClick={() => setPage(listData.pagination.page - 1)}>Previous conversations</button><span>Page {listData.pagination.page} of {Math.max(1, listData.pagination.totalPages)}</span><button className="secondary" disabled={listData.pagination.page >= listData.pagination.totalPages} onClick={() => setPage(listData.pagination.page + 1)}>Next conversations</button></div>
      </>}
    </aside><section aria-label="Message history">{userId ? !isUuid(userId) || userId === user?.id ? <p role="alert">This conversation is unavailable.</p> : <Conversation key={`${userId}:${accessToken}`} id={userId} /> : <p>Select a conversation to view messages.</p>}</section></div>
  </>;
}

function Conversation({ id }: { id: string }) {
  const { accessToken, user } = useAuth();
  const realtime = useRealtime();
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [nextPage, setNextPage] = useState(2);
  const [totalPages, setTotalPages] = useState(0);
  const [readyKey, setReadyKey] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<SendMessagePayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [olderBusy, setOlderBusy] = useState(false);
  const [validation, setValidation] = useState("");
  const [attempt, setAttempt] = useState(0);
  const active = useRef(true);
  const locked = useRef(false);
  const generation = useRef(0);
  const restricted = realtime.denied.includes(id);
  const key = `${id}:${accessToken}:${realtime.epoch}:${attempt}`;
  useEffect(() => { active.current = true; return () => { active.current = false; ++generation.current; }; }, []);
  useEffect(() => {
    const current = ++generation.current; let live = true;
    setHistory([]); setReadyKey(""); setError(null); setNextPage(2); setTotalPages(0); setOlderBusy(false);
    if (restricted || !accessToken) return;
    void realtime.service.messages(id, { page: 1, limit: 20 }, accessToken).then(data => {
      if (!live || current !== generation.current) return;
      if (data.items.some(message => !pair(message))) { setError(new Error("Unexpected conversation")); return; }
      setHistory(mergeMessages(data.items)); setTotalPages(data.pagination.totalPages); setReadyKey(key);
    }, cause => { if (live && current === generation.current) { setError(cause); if (denial(cause)) realtime.deny(id); } });
    return () => { live = false; };
  }, [id, accessToken, realtime.service, key, restricted]);
  function pair(message: ChatMessage) { return message.senderId === user?.id && message.receiverId === id || message.senderId === id && message.receiverId === user?.id; }
  function denial(cause: unknown) { return cause instanceof ApiRequestError && [ERROR_CODES.USER_BLOCKED, ERROR_CODES.NOT_CONNECTED, ERROR_CODES.PROFILE_NOT_FOUND].some(code => code === cause.error.code); }
  const messages = restricted || readyKey !== key ? [] : mergeMessages(history, realtime.messages.filter(pair));
  async function send(payload: SendMessagePayload) {
    if (locked.current || restricted || readyKey !== key) return;
    locked.current = true; setBusy(true); setError(null); setPending(payload);
    try { await realtime.send(payload); if (active.current) { setPending(null); setDraft(""); } }
    catch (cause) { if (active.current) { setError(cause); if (denial(cause)) realtime.deny(id); } }
    finally { locked.current = false; if (active.current) setBusy(false); }
  }
  const resolvedPending = pending && mergeMessages(history, realtime.messages).some(message => message.senderId === user?.id && message.receiverId === pending.receiverId && message.clientMessageId === pending.clientMessageId && message.content === pending.content);
  useEffect(() => { if (resolvedPending) { setPending(null); setDraft(""); } }, [resolvedPending]);
  if (restricted) return <><h2>Conversation unavailable</h2><p>Messaging requires a current mutual connection. Previous messages are hidden.</p><Link to="/interactions/connections">Review connections</Link></>;
  return <><h2>Conversation</h2><ErrorNotice error={error} />
    {readyKey !== key ? <><p role="status">{error ? "History could not be loaded." : "Loading messages..."}</p>{error && <button className="secondary" onClick={() => setAttempt(value => value + 1)}>Retry history</button>}</> : <>
      {nextPage <= totalPages && <button className="secondary" disabled={olderBusy} onClick={() => {
        const current = generation.current; setOlderBusy(true); setError(null);
        void realtime.service.messages(id, { page: nextPage, limit: 20 }, accessToken!).then(data => { if (active.current && generation.current === current) { if (data.items.some(message => !pair(message))) throw new Error("Unexpected conversation"); setHistory(previous => mergeMessages(previous, data.items)); setNextPage(data.pagination.page + 1); setTotalPages(data.pagination.totalPages); } }).catch(cause => { if (active.current && generation.current === current) { setError(cause); if (denial(cause)) realtime.deny(id); } }).finally(() => { if (active.current) setOlderBusy(false); });
      }}>{olderBusy ? "Loading older messages..." : "Load older messages"}</button>}
      <ol className="message-list" aria-live="polite" aria-label="Messages">{messages.map(message => <li key={message.id} className={message.senderId === user?.id ? "outgoing" : "incoming"}><p>{message.content}</p><time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString()}</time></li>)}</ol>{!messages.length && <p>No messages yet.</p>}
    </>}
    <form className="message-composer" onSubmit={event => { event.preventDefault(); const content = draft.trim(); const invalid = messageError(content); setValidation(invalid); if (!invalid) void send({ receiverId: id, clientMessageId: crypto.randomUUID(), content }); }}>
      <div className="field"><label htmlFor="message-content">Message</label><textarea id="message-content" rows={3} value={draft} onChange={event => setDraft(event.target.value)} disabled={busy || Boolean(pending)} aria-invalid={Boolean(validation)} aria-describedby="message-error" /><p id="message-error" className="field-error">{validation}</p></div>
      <button className="primary compact" disabled={busy || !realtime.online || readyKey !== key || Boolean(pending)} type="submit">{busy ? "Sending..." : "Send message"}</button>
      {pending && !busy && <div className="notice"><p>Delivery is unconfirmed. Retry keeps the same message identity to prevent duplicates.</p><button type="button" className="secondary" disabled={!realtime.online || readyKey !== key} onClick={() => void send(pending)}>Retry message</button></div>}
    </form>
  </>;
}
