import { DEFAULT_SEXUAL_PREFERENCE, ERROR_CODES, API_ROUTES } from "@matcha/shared";
import type { ApiResponse, ErrorCode, PublicProfile, Tag, UserProfile } from "@matcha/shared";
import { ApiRequestError, TransportError, unwrap } from "../../services/api/client";
import type { ProfileService } from "./service";
import { ageFromDate, completionChecklist, pictureError, validateProfile } from "./validation";

export function createMockProfileService(delay = 250): ProfileService {
  const catalog: Tag[] = ["art", "books", "coffee", "cooking", "cycling", "design", "films", "hiking", "music", "photography", "travel", "yoga"].map((name, index) => ({ id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, name }));
  let profile: UserProfile = { id: "00000000-0000-4000-8000-000000000001", username: "demo", firstName: "Alex", lastName: "Demo", email: "demo@example.invalid", dateOfBirth: null, gender: null, sexualPreference: DEFAULT_SEXUAL_PREFERENCE, bio: "", fameRating: 0, tags: [], pictures: [], location: null, isOnline: false, lastSeen: null, profileComplete: false };
  const images = new Map<string, Blob>();
  let usedEmailToken = false;
  let pendingEmail: string | null = null;
  let emailRequestCount = 0;
  let emailToken = "c".repeat(64);
  const fail = (code: ErrorCode, status = 422): never => { throw new ApiRequestError(status, { code, message: code }); };
  const success = <T,>(data: T): T => unwrap<T>({ success: true, data: structuredClone(data), error: null } satisfies ApiResponse<T>);
  async function wait(token?: string) {
    await new Promise(resolve => setTimeout(resolve, delay));
    if (token !== undefined && !token) fail(ERROR_CODES.UNAUTHORIZED, 401);
  }
  const refresh = () => { profile.profileComplete = completionChecklist(profile, true).every(item => item.done); };
  const collection = () => { refresh(); return success({ pictures: profile.pictures }); };
  const existing = (id: string) => profile.pictures.find(picture => picture.id === id) ?? fail(ERROR_CODES.NOT_FOUND, 404);
  return {
    async me(token) { await wait(token); return success(profile); },
    async update(request, token) {
      await wait(token);
      if (Object.keys(validateProfile(request)).length || request.tagIds?.some(id => !catalog.some(tag => tag.id === id))) fail(ERROR_CODES.VALIDATION_ERROR);
      const { tagIds, ...fields } = request;
      profile = { ...profile, ...fields, tags: tagIds ? catalog.filter(tag => tagIds.includes(tag.id)) : profile.tags };
      refresh();
      return success(profile);
    },
    async publicProfile(username, token) {
      await wait(token);
      if (username === "offline") throw new TransportError("network");
      if (!["demo", "sam_demo"].includes(username)) fail(ERROR_CODES.PROFILE_NOT_FOUND, 404);
      const publicData: PublicProfile = {
        id: profile.id, username: profile.username, firstName: profile.firstName, lastName: profile.lastName,
        gender: profile.gender, sexualPreference: profile.sexualPreference, bio: profile.bio,
        fameRating: profile.fameRating, tags: profile.tags, pictures: profile.pictures,
        isOnline: profile.isOnline, lastSeen: profile.lastSeen, age: ageFromDate(profile.dateOfBirth),
        location: profile.location ? { city: profile.location.city, neighborhood: profile.location.neighborhood } : null,
        likedByMe: false, hasLikedMe: false, isConnected: false,
      };
      if (username === "sam_demo") Object.assign(publicData, { id: "00000000-0000-4000-8000-000000000002", username, firstName: "Sam", lastName: "Example", age: 27, gender: "non_binary", bio: "Weekend trails, independent films, and recipes worth sharing. Always up for a new book recommendation.", tags: [catalog[1], catalog[7], catalog[8]], pictures: [], location: { city: "Casablanca", neighborhood: null }, fameRating: 12, isOnline: true });
      return success(publicData);
    },
    async tags(token) { await wait(token); return success(catalog); },
    async image(id, token) { await wait(token); return images.get(id) ?? fail(ERROR_CODES.NOT_FOUND, 404); },
    async upload(file, token) {
      await wait(token);
      if (profile.pictures.length >= 5) fail(ERROR_CODES.UPLOAD_LIMIT_REACHED, 409);
      if (pictureError(file, 0)) fail(file.size > 5242880 ? ERROR_CODES.UPLOAD_TOO_LARGE : ERROR_CODES.UPLOAD_INVALID_TYPE);
      const id = crypto.randomUUID();
      images.set(id, file);
      profile.pictures.push({ id, url: `http://localhost:3000${API_ROUTES.PROFILE.PICTURE.replace(":pictureId", id)}`, position: profile.pictures.length + 1, isMain: profile.pictures.length === 0 });
      return collection();
    },
    async remove(id, token) {
      await wait(token); existing(id); images.delete(id);
      profile.pictures = profile.pictures.filter(picture => picture.id !== id).map((picture, index) => ({ ...picture, position: index + 1 }));
      if (profile.pictures.length && !profile.pictures.some(picture => picture.isMain)) profile.pictures[0].isMain = true;
      return collection();
    },
    async setMain(id, token) { await wait(token); existing(id); profile.pictures = profile.pictures.map(picture => ({ ...picture, isMain: picture.id === id })); return collection(); },
    async changeEmail(request, token) {
      await wait(token);
      if (request.password !== "DemoPassword123") fail(ERROR_CODES.INVALID_CURRENT_PASSWORD, 403);
      if (request.newEmail === "taken@example.invalid") fail(ERROR_CODES.EMAIL_ALREADY_EXISTS, 409);
      if (request.newEmail === profile.email) fail(ERROR_CODES.VALIDATION_ERROR);
      pendingEmail = request.newEmail;
      emailRequestCount += 1;
      emailToken = emailRequestCount === 1 ? "c".repeat(64) : emailRequestCount.toString(16).padStart(64, "c");
      usedEmailToken = false;
      return success({ message: "Check your new inbox to verify the change. Your current email remains active." });
    },
    async verifyEmailChange({ token }) {
      await wait();
      if (usedEmailToken || token !== emailToken) fail(ERROR_CODES.INVALID_EMAIL_CHANGE_TOKEN, 400);
      usedEmailToken = true;
      if (pendingEmail) profile.email = pendingEmail;
      pendingEmail = null;
      return success({ message: "Your email change is verified. Sign in again to continue." });
    },
  };
}
