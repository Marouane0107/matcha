import type { SearchQuery } from "@matcha/shared";

export const sortLabels = { age: "Age", distance: "Distance", fame: "Fame rating", commonTags: "Common interests" } as const;
export function searchErrors(query: SearchQuery) {
  const errors: Record<string, string> = {};
  for (const key of ["minAge", "maxAge", "minFame", "maxFame", "maxDistance"] as const) {
    const value = query[key];
    if (value === undefined) continue;
    const age = key.endsWith("Age");
    if (!Number.isFinite(value) || value < (age ? 18 : key === "maxDistance" ? Number.MIN_VALUE : 0) || value > (age ? 120 : key === "maxDistance" ? 20000 : 100) || age && !Number.isInteger(value)) errors[key] = age ? "Enter a whole age from 18 to 120." : key === "maxDistance" ? "Enter a distance greater than 0 and up to 20,000 km." : "Enter a fame rating from 0 to 100.";
  }
  if ((query.minAge ?? 18) > (query.maxAge ?? 120)) errors.maxAge = "Maximum age must be at least the minimum.";
  if ((query.minFame ?? 0) > (query.maxFame ?? 100)) errors.maxFame = "Maximum fame must be at least the minimum.";
  if (query.tags && (query.tags.length > 10 || new Set(query.tags).size !== query.tags.length || query.tags.some(id => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)))) errors.tags = "Choose up to ten different interests from the catalog.";
  return errors;
}
