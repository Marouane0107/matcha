import { API_ROUTES } from "@matcha/shared";
import type { PaginatedData, ProfileSearchResult, SearchQuery } from "@matcha/shared";
import { createApiClient, isRecord } from "../../services/api/client";
import { isPublicProfile } from "../profile/service";

export interface DiscoveryService {
  suggestions(query: SearchQuery, token: string): Promise<PaginatedData<ProfileSearchResult>>;
  search(query: SearchQuery, token: string): Promise<PaginatedData<ProfileSearchResult>>;
}

export function serializeSearch(query: SearchQuery) {
  const params = new URLSearchParams();
  for (const key of ["minAge", "maxAge", "minFame", "maxFame", "maxDistance", "sortBy", "sortOrder", "page", "limit"] as const) {
    if (query[key] !== undefined) params.set(key, String(query[key]));
  }
  if (query.tags?.length) params.set("tags", query.tags.join(","));
  if (query.location) params.set("location", `${query.location.latitude},${query.location.longitude}`);
  return params;
}

export function isSearchPage(value: unknown): value is PaginatedData<ProfileSearchResult> {
  return isRecord(value) && Array.isArray(value.items) && value.items.every(item => isPublicProfile(item) &&
    "distanceKm" in item && typeof item.distanceKm === "number" && Number.isFinite(item.distanceKm) && item.distanceKm >= 0 &&
    "commonTags" in item && Number.isInteger(item.commonTags) && Number(item.commonTags) >= 0 && Number(item.commonTags) <= 10) &&
    isRecord(value.pagination) && Number.isInteger(value.pagination.page) && Number(value.pagination.page) >= 1 && Number.isInteger(value.pagination.limit) && Number(value.pagination.limit) >= 1 && Number(value.pagination.limit) <= 100 &&
    Number.isInteger(value.pagination.total) && Number(value.pagination.total) >= 0 && Number.isInteger(value.pagination.totalPages) && Number(value.pagination.totalPages) >= 0;
}

export function createRealDiscoveryService(client: ReturnType<typeof createApiClient>): DiscoveryService {
  const request = (path: string, query: SearchQuery, accessToken: string) => client.request(path, { query: serializeSearch(query), accessToken, status: 200, validate: isSearchPage });
  return {
    suggestions: (query, token) => request(API_ROUTES.BROWSE.SUGGESTIONS, query, token),
    search: (query, token) => request(API_ROUTES.SEARCH.PROFILES, query, token),
  };
}