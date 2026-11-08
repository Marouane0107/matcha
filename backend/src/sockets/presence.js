const online = new Map();

export function addSocket(userId, socketId) {
  let sockets = online.get(userId);
  if (!sockets) {
    sockets = new Set();
    online.set(userId, sockets);
  }
  sockets.add(socketId);
  return sockets.size;
}

export function removeSocket(userId, socketId) {
  const sockets = online.get(userId);
  if (!sockets) return 0;
  sockets.delete(socketId);
  if (sockets.size === 0) online.delete(userId);
  return sockets.size;
}

export function isUserOnline(userId) {
  return (online.get(userId)?.size ?? 0) > 0;
}
