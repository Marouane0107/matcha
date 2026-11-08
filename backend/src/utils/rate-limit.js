export function createRateLimiter(windowMs = 60000) {
  const buckets = new Map();
  return function check(key, limit) {
    const now = Date.now();
    const bucket = buckets.get(key);
    if (bucket && now < bucket.windowStart + windowMs) {
      if (bucket.count >= limit) return false;
      bucket.count += 1;
      return true;
    }
    buckets.set(key, { windowStart: now, count: 1 });
    return true;
  };
}
