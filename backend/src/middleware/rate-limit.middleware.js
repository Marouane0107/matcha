import { apiError } from '../config/shared.js';

const buckets = new Map();
const cleanup = setInterval(() => { for (const [key, value] of buckets) if (value.until <= Date.now()) buckets.delete(key); }, 60000); cleanup.unref();
export function limit(key, maximum, duration = 60000) {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || bucket.until <= now) { bucket = { count: 0, until: now + duration }; buckets.set(key, bucket); }
  return ++bucket.count > maximum ? Math.max(1, Math.ceil((bucket.until - now) / 1000)) : 0;
}
export function rateLimit(req, res, next) {
  const action = req.path.split('/').at(-1);
  let delay = 0;
  if (req.path === '/api/auth/login') delay = limit(`login:${req.ip}:${String(req.body?.username ?? '').trim().toLowerCase()}`, 10, 900000);
  else if (req.path.startsWith('/api/auth/') && req.method === 'POST' && !['logout', 'change-email'].includes(action)) delay = limit(`auth:${req.ip}:${action}`, 5);
  if (delay) return res.set('Retry-After', String(delay)).status(429).json(apiError('RATE_LIMITED', 'Too many requests'));
  next();
}

export function authenticatedRateLimit(req, res, next) {
  let delay = limit(`rest:${req.user.id}`, 120);
  if (!delay && req.method === 'POST' && /\/view$/.test(req.originalUrl.split('?')[0])) delay = limit(`views:${req.user.id}`, 30);
  if (!delay && req.method === 'POST' && req.originalUrl.split('?')[0] === '/api/auth/change-email') delay = limit(`change-email:${req.user.id}`, 5);
  if (delay) return res.set('Retry-After', String(delay)).status(429).json(apiError('RATE_LIMITED', 'Too many requests'));
  next();
}