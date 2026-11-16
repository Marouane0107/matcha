export const sockets = new Map();
export const isOnline = id => (sockets.get(id)?.size ?? 0) > 0;