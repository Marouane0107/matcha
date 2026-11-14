import { ERROR_CODES } from "@matcha/shared";
import type { Block, Connection, ErrorCode, Like, LikeStatus, PaginatedData, PaginationQuery, ProfileView, PublicProfile } from "@matcha/shared";
import { ApiRequestError, TransportError, unwrap } from "../../services/api/client";
import type { ProfileService } from "../profile/service";
import type { InteractionService } from "./service";

export function createMockInteractionBundle(base: ProfileService, scenario = "eligible", delay = 250) {
  const ownerId = "00000000-0000-4000-8000-000000000001";
  const ids = [2, 3, 4].map(value => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`);
  const names = ["sam_demo", "noor_demo", "robin_demo"];
  const relations = new Map<string, LikeStatus>(ids.map((id, index) => [id, { likedByMe: index === 1, hasLikedMe: index < 2, isConnected: index === 1 }]));
  const additionalProfiles = new Map<string, PublicProfile>();
  const blocks = new Map<string, Block>();
  const connectedAt = new Map<string, string>([[ids[1], "2026-11-03T12:00:00.000Z"]]);
  const otherBlocked = scenario === "blocked";
  const fail = (code: ErrorCode, status = 422): never => { throw new ApiRequestError(status, { code, message: code }); };
  const success = <Value,>(data: Value): Value => unwrap({ success: true, data: structuredClone(data), error: null });
  async function wait(token: string) {
    await new Promise(resolve => setTimeout(resolve, delay));
    if (!token) fail(ERROR_CODES.UNAUTHORIZED, 401);
    if (scenario === "network") throw new TransportError("network");
    if (scenario === "api") fail(ERROR_CODES.INTERNAL_ERROR, 500);
  }
  function exists(id: string) { if (!ids.includes(id) && !additionalProfiles.has(id)) fail(ERROR_CODES.PROFILE_NOT_FOUND, 404); }
  const status = (id: string) => relations.get(id)!;
  async function person(id: string, token: string): Promise<PublicProfile> {
    const additional = additionalProfiles.get(id);
    if (additional) return { ...additional, ...status(id) };
    const index = ids.indexOf(id);
    const fixture = await base.publicProfile("sam_demo", token);
    return { ...fixture, id, username: names[index], firstName: ["Sam", "Noor", "Robin"][index], ...status(id) };
  }
  function visible(id: string) { return !blocks.has(id) && !(otherBlocked && id === ids[0]); }
  async function page<Item>(query: PaginationQuery, token: string, items: () => Promise<Item[]>): Promise<PaginatedData<Item>> {
    await wait(token);
    const all = scenario === "empty" ? [] : await items();
    const current = query.page ?? 1;
    const limit = query.limit ?? 20;
    return success({ items: all.slice((current - 1) * limit, current * limit), pagination: { page: current, limit, total: all.length, totalPages: Math.ceil(all.length / limit) } });
  }
  const service: InteractionService = {
    async like(id, token) {
      await wait(token);
      if (id === ownerId) fail(ERROR_CODES.CANNOT_LIKE_SELF, 400);
      exists(id);
      if (!visible(id)) fail(ERROR_CODES.USER_BLOCKED, 403);
      if (scenario === "no_picture") fail(ERROR_CODES.PROFILE_PICTURE_REQUIRED);
      if (scenario === "incomplete") fail(ERROR_CODES.PROFILE_INCOMPLETE);
      if (status(id).likedByMe) fail(ERROR_CODES.ALREADY_LIKED, 409);
      const next = { ...status(id), likedByMe: true, isConnected: status(id).hasLikedMe };
      relations.set(id, next); if (next.isConnected) connectedAt.set(id, new Date().toISOString()); return success(next);
    },
    async unlike(id, token) {
      await wait(token); exists(id);
      if (!visible(id)) fail(ERROR_CODES.PROFILE_NOT_FOUND, 404);
      if (!status(id).likedByMe) fail(ERROR_CODES.LIKE_NOT_FOUND, 404);
      const next = { ...status(id), likedByMe: false, isConnected: false };
      relations.set(id, next); connectedAt.delete(id); return success(next);
    },
    async visit(id, token) {
      await wait(token);
      if (id === ownerId) fail(ERROR_CODES.VALIDATION_ERROR);
      exists(id); if (!visible(id)) fail(ERROR_CODES.PROFILE_NOT_FOUND, 404);
      return success({ message: "Visit recorded." });
    },
    async block(id, token) {
      await wait(token); if (id === ownerId) fail(ERROR_CODES.VALIDATION_ERROR); exists(id);
      const block = blocks.get(id) ?? { id: crypto.randomUUID(), blockedUserId: id, createdAt: new Date().toISOString() };
      blocks.set(id, block); connectedAt.delete(id); relations.set(id, { likedByMe: false, hasLikedMe: false, isConnected: false });
      return success(block);
    },
    async unblock(id, token) { await wait(token); exists(id); blocks.delete(id); },
    async report(id, request, token) {
      await wait(token); if (id === ownerId) fail(ERROR_CODES.VALIDATION_ERROR); exists(id);
      if (!request.details.trim() || [...request.details.trim()].length > 2000 || !["fake_account", "spam", "harassment", "other"].includes(request.reason)) fail(ERROR_CODES.VALIDATION_ERROR);
      return success({ ...request, details: request.details.trim(), id: crypto.randomUUID(), reportedUserId: id, createdAt: new Date().toISOString() });
    },
    likes: (query, token) => page<Like>(query, token, () => Promise.all(ids.filter(id => visible(id) && status(id).hasLikedMe).map(async id => ({ id: `10000000-0000-4000-8000-${String(ids.indexOf(id) + 1).padStart(12, "0")}`, actor: await person(id, token), createdAt: `2026-11-0${3 - ids.indexOf(id)}T12:00:00.000Z` })))),
    views: (query, token) => page<ProfileView>(query, token, () => Promise.all(ids.filter(visible).map(async id => ({ id: `20000000-0000-4000-8000-${String(ids.indexOf(id) + 1).padStart(12, "0")}`, viewer: await person(id, token), viewedAt: `2026-11-0${3 - ids.indexOf(id)}T12:00:00.000Z` })))),
    connections: (query, token) => page<Connection>(query, token, () => Promise.all([...ids, ...additionalProfiles.keys()].filter(id => visible(id) && status(id).isConnected).sort((left, right) => connectedAt.get(right)!.localeCompare(connectedAt.get(left)!) || right.localeCompare(left)).map(async id => ({ user: await person(id, token), connectedAt: connectedAt.get(id)! })))),
  };
  const profiles: ProfileService = { ...base, async publicProfile(username, token) {
    const index = names.indexOf(username);
    if (index < 0) {
      const profile = await base.publicProfile(username, token);
      if (profile.id === ownerId) return profile;
      if (!visible(profile.id)) fail(ERROR_CODES.PROFILE_NOT_FOUND, 404);
      additionalProfiles.set(profile.id, profile);
      if (!relations.has(profile.id)) relations.set(profile.id, { likedByMe: profile.likedByMe, hasLikedMe: profile.hasLikedMe, isConnected: profile.isConnected });
      return success({ ...profile, ...status(profile.id) });
    }
    await wait(token);
    if (!visible(ids[index])) fail(ERROR_CODES.PROFILE_NOT_FOUND, 404);
    return person(ids[index], token);
  } };
  return { service, profiles };
}
