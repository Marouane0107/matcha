export function buildChatMessage(row) {
  return {
    id: row.id,
    senderId: row.sender_id,
    receiverId: row.receiver_id,
    clientMessageId: row.client_message_id ?? '',
    content: row.content,
    createdAt: new Date(row.created_at).toISOString(),
  };
}
