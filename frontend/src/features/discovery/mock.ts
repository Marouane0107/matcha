import { ERROR_CODES } from "@matcha/shared";
import type { PaginatedData, ProfileSearchResult, SearchQuery } from "@matcha/shared";
import { ApiRequestError, TransportError, unwrap } from "../../services/api/client";
import type { ProfileService } from "../profile/service";
import type { DiscoveryService } from "./service";
import { discoveryFixtures } from "./fixtures";
import { searchErrors } from "./validation";

export function createMockDiscoveryService(profiles: ProfileService, scenario = "populated", delay = 250): DiscoveryService {
  async function request(query: SearchQuery, token: string, suggestions: boolean): Promise<PaginatedData<ProfileSearchResult>> {
    await new Promise(resolve => setTimeout(resolve, delay));
    if (!token) throw new ApiRequestError(401, { code: ERROR_CODES.UNAUTHORIZED, message: "Unauthorized" });
    if (scenario === "network") throw new TransportError("network");
    if (scenario === "api") throw new ApiRequestError(500, { code: ERROR_CODES.INTERNAL_ERROR, message: "Fixture failure" });
    if (scenario === "incomplete" || scenario === "location") throw new ApiRequestError(422, { code: scenario === "location" ? ERROR_CODES.LOCATION_REQUIRED : ERROR_CODES.PROFILE_INCOMPLETE, message: "Complete your profile" });
    if (Object.keys(searchErrors(query)).length) throw new ApiRequestError(422, { code: ERROR_CODES.VALIDATION_ERROR, message: "Invalid criteria" });
    let items = scenario === "empty" ? [] : discoveryFixtures(await profiles.tags(token));
    items = items.filter(item => item.age! >= (query.minAge ?? 18) && item.age! <= (query.maxAge ?? 120) && item.fameRating >= (query.minFame ?? 0) && item.fameRating <= (query.maxFame ?? 100) && item.distanceKm <= (query.maxDistance ?? Infinity) && (query.tags ?? []).every(id => item.tags.some(tag => tag.id === id)));
    const sort = query.sortBy ?? "distance";
    const score = (item: ProfileSearchResult) => sort === "age" ? item.age! : sort === "fame" ? item.fameRating : sort === "commonTags" ? item.commonTags : item.distanceKm;
    items.sort((left, right) => (score(left) - score(right)) * (query.sortOrder === "desc" ? -1 : 1) || (suggestions && !query.sortBy ? right.commonTags - left.commonTags || right.fameRating - left.fameRating : 0) || left.id.localeCompare(right.id));
    const page = query.page ?? 1;
    const limit = query.limit ?? 12;
    return unwrap({ success: true, error: null, data: { items: structuredClone(items.slice((page - 1) * limit, page * limit)), pagination: { page, limit, total: items.length, totalPages: Math.ceil(items.length / limit) } } });
  }
  return { suggestions: (query, token) => request(query, token, true), search: (query, token) => request(query, token, false) };
}
