import type { ProfileUpdateRequest, UserProfile } from "@matcha/shared";
import { nameError } from "../auth/utils/validation";

export const MAX_PICTURES = 5;
export const MAX_TAGS = 10;
export const MAX_PICTURE_BYTES = 5242880;
export const genders = { man: "Man", woman: "Woman", non_binary: "Non-binary" } as const;
export const preferences = { men: "Men", women: "Women", everyone: "Everyone" } as const;

export function ageFromDate(value: string | null, now = new Date()): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  const birthdayPending = now.getUTCMonth() < date.getUTCMonth() || (now.getUTCMonth() === date.getUTCMonth() && now.getUTCDate() < date.getUTCDate());
  return now.getUTCFullYear() - date.getUTCFullYear() - Number(birthdayPending);
}

export function validateProfile(request: ProfileUpdateRequest, now = new Date()) {
  const errors: Record<string, string> = {};
  for (const key of ["firstName", "lastName"] as const) {
    if (request[key] !== undefined) {
      const error = nameError(request[key].trim());
      if (error) errors[key] = error;
    }
  }
  if (request.dateOfBirth !== undefined) {
    const age = ageFromDate(request.dateOfBirth, now);
    if (age === null || age < 18 || age > 120) errors.dateOfBirth = "Enter a valid birth date. You must be 18 to 120 years old.";
  }
  if (request.gender !== undefined && !Object.hasOwn(genders, request.gender)) errors.gender = "Choose a listed gender.";
  if (request.sexualPreference !== undefined && !Object.hasOwn(preferences, request.sexualPreference)) errors.sexualPreference = "Choose a listed preference.";
  if (request.bio !== undefined && [...request.bio.trim()].length > 1000) errors.bio = "Keep your biography within 1,000 characters.";
  if (request.tagIds && (request.tagIds.length > MAX_TAGS || new Set(request.tagIds).size !== request.tagIds.length || request.tagIds.some(id => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)))) errors.tagIds = "Choose up to 10 distinct interests from the catalog.";
  return errors;
}

export function pictureError(file: Pick<File, "type" | "size">, count: number): string | undefined {
  if (count >= MAX_PICTURES) return "You already have five photos. Remove one before adding another.";
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return "Choose a JPEG, PNG or WebP image.";
  if (file.size === 0 || file.size > MAX_PICTURE_BYTES) return "Choose a nonempty image no larger than 5 MiB.";
}

export function toggleTag(selected: string[], id: string): string[] {
  return selected.includes(id) ? selected.filter(value => value !== id) : selected.length < MAX_TAGS ? [...selected, id] : selected;
}

export function completionChecklist(profile: UserProfile, emailVerified: boolean) {
  const age = ageFromDate(profile.dateOfBirth);
  return [
    { label: "Verified email", done: emailVerified, href: "/resend-verification" },
    { label: "First and last name", done: Boolean(profile.firstName.trim() && profile.lastName.trim()), href: "/profile/edit" },
    { label: "Adult birth date", done: age !== null && age >= 18 && age <= 120, href: "/profile/edit" },
    { label: "Gender", done: profile.gender !== null, href: "/profile/edit" },
    { label: "Biography", done: Boolean(profile.bio.trim()), href: "/profile/edit" },
    { label: "At least one interest", done: profile.tags.length > 0, href: "/profile/edit#interests" },
    { label: "Main photo", done: profile.pictures.some(picture => picture.isMain), href: "/profile/pictures" },
    { label: "Saved location", done: profile.location !== null, href: null },
  ];
}
