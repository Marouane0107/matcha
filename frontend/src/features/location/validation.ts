import type { LocationUpdateRequest } from "@matcha/shared";

export function locationErrors(request: LocationUpdateRequest) {
  const errors: Record<string, string> = {};
  if (!request.city.trim() || [...request.city.trim()].length > 100 || /\p{Cc}/u.test(request.city)) errors.city = "Enter a city, up to 100 characters. Include region or country if needed.";
  if (request.neighborhood !== null && (!request.neighborhood.trim() || [...request.neighborhood.trim()].length > 100 || /\p{Cc}/u.test(request.neighborhood))) errors.neighborhood = "Enter a neighborhood up to 100 characters, or leave it blank.";
  if (request.mode === "gps" && (!Number.isFinite(request.latitude) || Math.abs(request.latitude) > 90 || !Number.isFinite(request.longitude) || Math.abs(request.longitude) > 180)) errors.gps = "Your position could not be read. Try again or enter your location manually.";
  if (request.mode === "manual" && ("latitude" in request || "longitude" in request)) errors.gps = "Manual locations must not include coordinates.";
  return errors;
}
