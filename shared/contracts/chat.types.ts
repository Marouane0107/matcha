export interface ChatMessage {
  id: string;
  senderId: string;
  receiverId: string;
  clientMessageId: string;
  content: string;
  createdAt: string;
}

export interface SendMessagePayload {
  receiverId: string;
  clientMessageId: string;
  content: string;
}

export interface MessageReceivedPayload {
  message: ChatMessage;
}

export interface ConversationPreview {
  user: import("./profile.types").PublicProfile;
  lastMessage: ChatMessage | null;
  connectedAt: string;
}

export interface UserStatusPayload {
  userId: string;
  isOnline: boolean;
  lastSeen: string | null;
}