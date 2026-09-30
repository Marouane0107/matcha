import type { PaginationQuery } from "./api.types";
import type { PublicProfile } from "./profile.types";

export interface SearchLocation {
  latitude: number;
  longitude: number;
}

export interface SearchFilters {
  minAge?: number;
  maxAge?: number;
  minFame?: number;
  maxFame?: number;
  maxDistance?: number;
  location?: SearchLocation;
  tags?: string[];
}

export interface SearchSort {
  sortBy?: "age" | "distance" | "fame" | "commonTags";
  sortOrder?: "asc" | "desc";
}

export interface SearchQuery extends SearchFilters, SearchSort, PaginationQuery {}

export interface ProfileSearchResult extends PublicProfile {
  distanceKm: number;
  commonTags: number;
}