import { API_ROUTES } from "@matcha/shared";
import type { Acknowledgement, ChangeEmailRequest, VerifyEmailChangeRequest, Picture, PictureCollection, ProfileUpdateRequest, PublicProfile, Tag, UserProfile } from "@matcha/shared";
import { createApiClient, isRecord } from "../../services/api/client";
import { genders, preferences } from "./validation";

export interface ProfileService {
  me(token: string): Promise<UserProfile>;
  update(request: ProfileUpdateRequest, token: string): Promise<UserProfile>;
  publicProfile(username: string, token: string): Promise<PublicProfile>;
  tags(token: string): Promise<Tag[]>;
  image(id: string, token: string): Promise<Blob>;
  upload(file: File, token: string): Promise<PictureCollection>;
  remove(id: string, token: string): Promise<PictureCollection>;
  setMain(id: string, token: string): Promise<PictureCollection>;
  changeEmail(request: ChangeEmailRequest, token: string): Promise<Acknowledgement>;
  verifyEmailChange(request: VerifyEmailChangeRequest): Promise<Acknowledgement>;
}

const strings = (value: Record<string, unknown>, keys: string[]) => keys.every(key => typeof value[key] === "string");
export const isTag = (value: unknown): value is Tag => isRecord(value) && strings(value, ["id", "name"]);
export const isPicture = (value: unknown): value is Picture => isRecord(value) && strings(value, ["id", "url"]) && typeof value.isMain === "boolean" && Number.isInteger(value.position) && Number(value.position) >= 1 && Number(value.position) <= 5;
export const isPictures = (value: unknown): value is PictureCollection => isRecord(value) && Array.isArray(value.pictures) && value.pictures.length <= 5 && value.pictures.every(isPicture) && (value.pictures.length === 0 || value.pictures.filter(picture => picture.isMain).length === 1) && new Set(value.pictures.map(picture => picture.id)).size === value.pictures.length && new Set(value.pictures.map(picture => picture.position)).size === value.pictures.length;
function identity(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && strings(value, ["id", "username", "firstName", "lastName", "bio"]) && (value.gender === null || typeof value.gender === "string" && Object.hasOwn(genders, value.gender)) && typeof value.sexualPreference === "string" && Object.hasOwn(preferences, value.sexualPreference) && typeof value.fameRating === "number" && Number.isFinite(value.fameRating) && value.fameRating >= 0 && value.fameRating <= 100 && Array.isArray(value.tags) && value.tags.length <= 10 && value.tags.every(isTag) && isPictures(value) && typeof value.isOnline === "boolean" && (value.lastSeen === null || typeof value.lastSeen === "string" && Number.isFinite(Date.parse(value.lastSeen)));
}
const publicLocation = (value: unknown) => value === null || isRecord(value) && typeof value.city === "string" && (value.neighborhood === null || typeof value.neighborhood === "string");
export function isUserProfile(value: unknown): value is UserProfile {
  return identity(value) && typeof value.email === "string" && (value.dateOfBirth === null || typeof value.dateOfBirth === "string") && typeof value.profileComplete === "boolean" && publicLocation(value.location) && (value.location === null || isRecord(value.location) && typeof value.location.latitude === "number" && Number.isFinite(value.location.latitude) && Math.abs(value.location.latitude) <= 90 && typeof value.location.longitude === "number" && Number.isFinite(value.location.longitude) && Math.abs(value.location.longitude) <= 180 && ["gps", "manual"].includes(String(value.location.mode)));
}
export function isPublicProfile(value: unknown): value is PublicProfile {
  return identity(value) && !["email", "dateOfBirth", "password", "passwordHash", "password_hash", "accessToken", "latitude", "longitude", "profileComplete"].some(key => key in value) && (value.age === null || Number.isInteger(value.age) && Number(value.age) >= 18 && Number(value.age) <= 120) && publicLocation(value.location) && (value.location === null || isRecord(value.location) && Object.keys(value.location).every(key => ["city", "neighborhood"].includes(key))) && ["likedByMe", "hasLikedMe", "isConnected"].every(key => typeof value[key] === "boolean");
}

export function createRealProfileService(client: ReturnType<typeof createApiClient>): ProfileService {
  const routes = API_ROUTES.PROFILE;
  const picturePath = (path: string, id: string) => path.replace(":pictureId", encodeURIComponent(id));
  const ack = (value: unknown): value is Acknowledgement => isRecord(value) && typeof value.message === "string";
  return {
    me: accessToken => client.request(routes.ME, { accessToken, status: 200, validate: isUserProfile }),
    update: (body, accessToken) => client.request(routes.ME, { method: "PATCH", body, accessToken, status: 200, validate: isUserProfile }),
    publicProfile: (username, accessToken) => client.request(routes.PUBLIC.replace(":username", encodeURIComponent(username)), { accessToken, status: 200, validate: isPublicProfile }),
    tags: accessToken => client.request(routes.TAGS, { accessToken, status: 200, validate: (value): value is Tag[] => Array.isArray(value) && value.every(isTag) }),
    image: (id, accessToken) => client.request(picturePath(routes.PICTURE, id), { accessToken, responseType: "image", status: 200, validate: (value): value is Blob => value instanceof Blob && value.size > 0 }),
    upload: (file, accessToken) => {
      const body = new FormData();
      body.append("picture", file);
      return client.request(routes.PICTURES, { method: "POST", body, accessToken, status: 201, validate: isPictures });
    },
    remove: (id, accessToken) => client.request(picturePath(routes.PICTURE, id), { method: "DELETE", accessToken, status: 200, validate: isPictures }),
    setMain: (id, accessToken) => client.request(picturePath(routes.MAIN_PICTURE, id), { method: "PATCH", accessToken, status: 200, validate: isPictures }),
    changeEmail: (body, accessToken) => client.request(API_ROUTES.AUTH.CHANGE_EMAIL, { method: "POST", body, accessToken, status: 200, validate: ack }),
    verifyEmailChange: body => client.request(API_ROUTES.AUTH.VERIFY_EMAIL_CHANGE, { method: "POST", body, status: 200, validate: ack }),
  };
}
