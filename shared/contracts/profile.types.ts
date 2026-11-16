export type Gender = "man" | "woman" | "non_binary";
export type SexualPreference = "men" | "women" | "everyone";
export const DEFAULT_SEXUAL_PREFERENCE: SexualPreference = "everyone";
export type LocationMode = "gps" | "manual";

export interface Tag {
  id: string;
  name: string;
}

export interface Picture {
  id: string;
  url: string;
  isMain: boolean;
  position: number;
}

export interface PublicLocation {
  city: string;
  neighborhood: string | null;
}

export interface Location extends PublicLocation {
  latitude: number;
  longitude: number;
  mode: LocationMode;
}

export interface ProfileIdentity {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  gender: Gender | null;
  sexualPreference: SexualPreference;
  bio: string;
  fameRating: number;
  tags: Tag[];
  pictures: Picture[];
  isOnline: boolean;
  lastSeen: string | null;
}

export interface PublicProfile extends ProfileIdentity {
  age: number | null;
  location: PublicLocation | null;
  likedByMe: boolean;
  hasLikedMe: boolean;
  isConnected: boolean;
}

export interface UserProfile extends ProfileIdentity {
  email: string;
  dateOfBirth: string | null;
  location: Location | null;
  profileComplete: boolean;
}

export interface ProfileUpdateRequest {
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  gender?: Gender;
  sexualPreference?: SexualPreference;
  bio?: string;
  tagIds?: string[];
}

export type LocationUpdateRequest =
  | (PublicLocation & { mode: "gps"; latitude: number; longitude: number })
  | (PublicLocation & { mode: "manual"; latitude?: never; longitude?: never });

export interface PictureCollection {
  pictures: Picture[];
}