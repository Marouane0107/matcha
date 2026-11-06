import { API_ROUTES } from "@matcha/shared";
import type { Acknowledgement, Block, Connection, Like, LikeStatus, PaginatedData, PaginationQuery, ProfileView, Report, ReportRequest } from "@matcha/shared";
import { createApiClient, isRecord } from "../../services/api/client";
import { isPublicProfile } from "../profile/service";

export interface InteractionService {
  like(id: string, token: string): Promise<LikeStatus>;
  unlike(id: string, token: string): Promise<LikeStatus>;
  visit(id: string, token: string): Promise<Acknowledgement>;
  block(id: string, token: string): Promise<Block>;
  unblock(id: string, token: string): Promise<void>;
  report(id: string, request: ReportRequest, token: string): Promise<Report>;
  likes(query: PaginationQuery, token: string): Promise<PaginatedData<Like>>;
  views(query: PaginationQuery, token: string): Promise<PaginatedData<ProfileView>>;
  connections(query: PaginationQuery, token: string): Promise<PaginatedData<Connection>>;
}
export const isLikeStatus = (value: unknown): value is LikeStatus => isRecord(value) && ["likedByMe", "hasLikedMe", "isConnected"].every(key => typeof value[key] === "boolean") && value.isConnected === (value.likedByMe && value.hasLikedMe);
const date = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value));
export const isBlock = (value: unknown): value is Block => isRecord(value) && typeof value.id === "string" && typeof value.blockedUserId === "string" && date(value.createdAt);
const isReport = (value: unknown): value is Report => isRecord(value) && typeof value.id === "string" && typeof value.reportedUserId === "string" && ["spam", "harassment", "fake_account", "other"].includes(String(value.reason)) && typeof value.details === "string" && date(value.createdAt);
export const isLike = (value: unknown): value is Like => isRecord(value) && typeof value.id === "string" && isPublicProfile(value.actor) && date(value.createdAt);
export const isView = (value: unknown): value is ProfileView => isRecord(value) && typeof value.id === "string" && isPublicProfile(value.viewer) && date(value.viewedAt);
export const isConnection = (value: unknown): value is Connection => isRecord(value) && isPublicProfile(value.user) && date(value.connectedAt);
export function isInteractionPage<Item>(value: unknown, item: (value: unknown) => value is Item): value is PaginatedData<Item> {
  if (!isRecord(value) || !Array.isArray(value.items) || !value.items.every(item) || !isRecord(value.pagination)) return false;
  const meta = value.pagination;
  return Number.isInteger(meta.page) && Number(meta.page) >= 1 && Number.isInteger(meta.limit) && Number(meta.limit) >= 1 && Number(meta.limit) <= 100 && Number.isInteger(meta.total) && Number(meta.total) >= 0 && Number.isInteger(meta.totalPages) && Number(meta.totalPages) >= 0;
}
export function createRealInteractionService(client: ReturnType<typeof createApiClient>): InteractionService {
  const routes = API_ROUTES.INTERACTIONS;
  const path = (route: string, id: string) => route.replace(":userId", encodeURIComponent(id));
  const page = <Item,>(route: string, query: PaginationQuery, accessToken: string, item: (value: unknown) => value is Item) => {
    const params = new URLSearchParams();
    if (query.page !== undefined) params.set("page", String(query.page));
    if (query.limit !== undefined) params.set("limit", String(query.limit));
    return client.request(route, { accessToken, query: params, status: 200, validate: (value): value is PaginatedData<Item> => isInteractionPage(value, item) });
  };
  return {
    like: (id, accessToken) => client.request(path(routes.LIKE, id), { method: "POST", accessToken, status: 201, validate: isLikeStatus }),
    unlike: (id, accessToken) => client.request(path(routes.LIKE, id), { method: "DELETE", accessToken, status: 200, validate: isLikeStatus }),
    visit: (id, accessToken) => client.request(path(routes.VIEW, id), { method: "POST", accessToken, status: 201, validate: (value): value is Acknowledgement => isRecord(value) && typeof value.message === "string" }),
    block: (id, accessToken) => client.request(path(routes.BLOCK, id), { method: "POST", accessToken, status: [200, 201], validate: isBlock }),
    unblock: (id, accessToken) => client.request(path(routes.BLOCK, id), { method: "DELETE", accessToken, status: 204, validate: (value): value is void => value === undefined }),
    report: (id, body, accessToken) => client.request(path(routes.REPORT, id), { method: "POST", body, accessToken, status: 201, validate: isReport }),
    likes: (query, token) => page(routes.LIKES_RECEIVED, query, token, isLike),
    views: (query, token) => page(routes.VIEWS, query, token, isView),
    connections: (query, token) => page(routes.CONNECTIONS, query, token, isConnection),
  };
}
