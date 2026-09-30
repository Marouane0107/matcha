import type { PublicProfile } from "./profile.types";

export interface LikeStatus {
  likedByMe: boolean;
  hasLikedMe: boolean;
  isConnected: boolean;
}

export interface Like {
  id: string;
  actor: PublicProfile;
  createdAt: string;
}

export interface Connection {
  user: PublicProfile;
  connectedAt: string;
}

export interface ProfileView {
  id: string;
  viewer: PublicProfile;
  viewedAt: string;
}

export interface Block {
  id: string;
  blockedUserId: string;
  createdAt: string;
}

export type ReportReason = "spam" | "harassment" | "fake_account" | "other";

export interface ReportRequest {
  reason: ReportReason;
  details: string;
}

export interface Report extends ReportRequest {
  id: string;
  reportedUserId: string;
  createdAt: string;
}