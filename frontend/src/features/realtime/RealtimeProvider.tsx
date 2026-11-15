import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { ChatMessage, Notification, SendMessagePayload, UserStatusPayload } from "@matcha/shared";
import { ERROR_CODES } from "@matcha/shared";
import { useAuth } from "../auth/AuthProvider";
import { useInteractions } from "../interactions/InteractionProvider";
import { ApiRequestError, createApiClient, TransportError } from "../../services/api/client";
import { createRealRealtimeService, mergeMessages } from "./service";
import type { RealtimeService } from "./service";
import { createSocketChannel } from "./channel";
import type { ChannelFactory, RealtimeChannel } from "./channel";
import type { InteractionService } from "../interactions/service";

export interface RealtimeBundle { service: RealtimeService; channel: ChannelFactory }
const Context = createContext<{
  service: RealtimeService; online: boolean; error: unknown; epoch: number; notificationEpoch: number;
  messages: ChatMessage[]; unread: number; notifications: Notification[]; denied: string[]; presence: Record<string, UserStatusPayload>;
  send: (payload: SendMessagePayload) => Promise<ChatMessage>; reconnect: () => void; refresh: () => void;
  read: (id: string) => Promise<void>; readAll: () => Promise<void>; deny: (id: string) => void;
} | null>(null);
export function RealtimeProvider({ bundle, children }: { bundle: RealtimeBundle; children: ReactNode }) {
  const { accessToken, user } = useAuth();
  if (!accessToken || !user) return <>{children}</>;
  return <RealtimeSession key={`${accessToken}:${user.id}`} bundle={bundle} token={accessToken} userId={user.id}>{children}</RealtimeSession>;
}
function RealtimeSession({ bundle, token, userId, children }: { bundle: RealtimeBundle; token: string; userId: string; children: ReactNode }) {
  const { session } = useAuth();
  const { revision, blocked } = useInteractions();
  const [online, setOnline] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [epoch, setEpoch] = useState(0);
  const [notificationEpoch, setNotificationEpoch] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [denied, setDenied] = useState<string[]>([]);
  const [presence, setPresence] = useState<Record<string, UserStatusPayload>>({});
  const channel = useRef<RealtimeChannel | null>(null);
  const active = useRef(true);
  const deniedRef = useRef(new Set<string>());
  const blockedRef = useRef(new Set<string>());
  const countGeneration = useRef(0);
  const deny = (id: string) => {
    deniedRef.current.add(id); setDenied([...deniedRef.current]);
    setMessages(current => current.filter(message => message.senderId !== id && message.receiverId !== id));
  };
  function handleError(cause: unknown) {
    if (cause instanceof ApiRequestError && (cause.error.code === ERROR_CODES.UNAUTHORIZED || cause.error.code === ERROR_CODES.EMAIL_NOT_VERIFIED)) { session.invalidate(token); channel.current = null; }
    if (active.current) setError(cause);
  }
  const refreshCount = () => {
    const generation = ++countGeneration.current;
    void bundle.service.unread(token).then(value => { if (active.current && generation === countGeneration.current) setUnread(value.unreadCount); }, cause => { if (active.current) handleError(cause); });
  };
  const refresh = () => { setEpoch(value => value + 1); setNotificationEpoch(value => value + 1); refreshCount(); };
  useEffect(() => {
    active.current = true;
    let dispose: (() => void) | undefined;
    try {
      const transport = bundle.channel(token, userId); channel.current = transport;
      dispose = transport.start({
        connected: () => { if (!active.current) return; deniedRef.current = new Set(blockedRef.current); setDenied([...deniedRef.current]); setOnline(true); setError(null); refresh(); },
        disconnected: () => { if (active.current) { setOnline(false); setEpoch(value => value + 1); } },
        error: cause => { if (active.current) { setOnline(false); handleError(cause); } },
        message: message => { if (active.current && (message.senderId === userId || message.receiverId === userId) && !deniedRef.current.has(message.senderId) && !deniedRef.current.has(message.receiverId)) setMessages(current => mergeMessages(current, [message])); },
        notification: item => { if (!active.current || item.actorId && blockedRef.current.has(item.actorId)) return; setNotifications(current => [item, ...current.filter(previous => previous.id !== item.id)].slice(0, 100)); setNotificationEpoch(value => value + 1); refreshCount(); },
        connection: connection => { if (!active.current || blockedRef.current.has(connection.user.id)) return; deniedRef.current.delete(connection.user.id); setDenied([...deniedRef.current]); refresh(); },
        removed: id => { if (!active.current) return; deny(id); refresh(); },
        presence: value => { if (active.current && !deniedRef.current.has(value.userId)) setPresence(current => ({ ...current, [value.userId]: value })); },
      });
    } catch (cause) { handleError(cause); }
    const focus = () => { if (active.current) refresh(); };
    window.addEventListener("focus", focus); refreshCount();
    return () => { active.current = false; ++countGeneration.current; dispose?.(); channel.current = null; window.removeEventListener("focus", focus); };
  }, [bundle, token, userId, session]);
  useEffect(() => { blockedRef.current = new Set(blocked.map(target => target.id)); deniedRef.current = new Set(blockedRef.current); setDenied([...deniedRef.current]); setMessages([]); setNotifications([]); refresh(); }, [revision]);
  const send = async (payload: SendMessagePayload) => {
    if (!online || !channel.current) throw new TransportError("network");
    if (deniedRef.current.has(payload.receiverId)) throw new ApiRequestError(403, { code: ERROR_CODES.NOT_CONNECTED, message: "Unavailable" });
    try {
      const message = await channel.current.send(payload);
      if (message.senderId !== userId || message.receiverId !== payload.receiverId || message.clientMessageId !== payload.clientMessageId || message.content !== payload.content) throw new TransportError("malformed");
      if (!active.current || deniedRef.current.has(payload.receiverId)) throw new ApiRequestError(403, { code: ERROR_CODES.NOT_CONNECTED, message: "Unavailable" });
      setMessages(current => mergeMessages(current, [message])); return message;
    } catch (cause) {
      if (active.current) {
        if (cause instanceof ApiRequestError && [ERROR_CODES.USER_BLOCKED, ERROR_CODES.NOT_CONNECTED, ERROR_CODES.PROFILE_NOT_FOUND].some(code => code === cause.error.code)) deny(payload.receiverId);
        if (cause instanceof ApiRequestError && [ERROR_CODES.UNAUTHORIZED, ERROR_CODES.EMAIL_NOT_VERIFIED].some(code => code === cause.error.code)) handleError(cause);
      }
      throw cause;
    }
  };
  const read = async (id: string) => {
    ++countGeneration.current;
    const result = await bundle.service.read(id, token);
    if (!active.current) return;
    setUnread(result.unreadCount); setNotifications(current => current.map(item => item.id === id ? { ...item, read: true } : item));
    setNotificationEpoch(value => value + 1); refreshCount();
  };
  const readAll = async () => {
    ++countGeneration.current;
    const result = await bundle.service.readAll(token);
    if (!active.current) return;
    setUnread(result.unreadCount); setNotifications([]); setNotificationEpoch(value => value + 1); refreshCount();
  };
  return <Context.Provider value={{ service: bundle.service, online, error, epoch, notificationEpoch, messages, notifications, unread, denied, presence, send, reconnect: () => channel.current?.reconnect(), refresh, read, readAll, deny }}>{children}</Context.Provider>;
}
export function useRealtime() { const context = useContext(Context); if (!context) throw new Error("RealtimeProvider is required"); return context; }
export async function selectRealtime(profiles: import("../profile/service").ProfileService, interactions: InteractionService, invalidate: (token: string) => void): Promise<RealtimeBundle> {
  if (import.meta.env.DEV && import.meta.env.VITE_REALTIME_MOCK === "true" && import.meta.env.VITE_PROFILE_MOCK === "true" && import.meta.env.VITE_INTERACTIONS_MOCK === "true") {
    const { createMockRealtimeBundle } = await import("./mock");
    return createMockRealtimeBundle(profiles, interactions, import.meta.env.VITE_REALTIME_SCENARIO ?? "populated");
  }
  return { service: createRealRealtimeService(createApiClient(import.meta.env.VITE_API_URL ?? "http://localhost:3000/api", invalidate)), channel: token => createSocketChannel(import.meta.env.VITE_SOCKET_URL ?? "http://localhost:3000", token) };
}
