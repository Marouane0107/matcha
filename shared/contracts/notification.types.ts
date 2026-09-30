export type NotificationType = "LIKE" | "PROFILE_VIEW" | "MESSAGE" | "CONNECTION" | "UNLIKE";

export interface NotificationMetadata {
  messageId?: string;
}

export interface Notification {
  id: string;
  type: NotificationType;
  actorId: string | null;
  actorUsername: string | null;
  read: boolean;
  createdAt: string;
  metadata: NotificationMetadata;
}

export interface NotificationReadPayload {
  notificationId: string;
}

export interface NotificationReadResult {
  notificationId: string;
  read: true;
  unreadCount: number;
}

export interface UnreadCountResponse {
  unreadCount: number;
}

export interface ReadAllNotificationsResponse extends UnreadCountResponse {
  updatedCount: number;
}