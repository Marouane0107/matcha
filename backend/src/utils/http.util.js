import { apiSuccess } from '../config/shared.js';

/** @returns {never} */
export function fail(code = 'VALIDATION_ERROR', status = 422) {
  throw Object.assign(new Error(code), { errorCode: code, statusCode: status });
}
export const uuid = value => typeof value === 'string' && /^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(value);
export const text = (value, min, max) => typeof value === 'string' && [...value].length >= min && [...value].length <= max && !/\p{Cc}/u.test(value);
export const email = value => typeof value === 'string' && value.length <= 254 && /^[^\s@\p{Cc}]+@[^\s@\p{Cc}]+\.[^\s@\p{Cc}]+$/u.test(value);
export function fields(body, allowed, required = []) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !allowed.includes(key)) || required.some(key => !(key in body))) fail();
}
export const route = handler => (req, res, next) => Promise.resolve().then(() => handler(req, res, next)).catch(next);
export const send = (res, data, status = 200) => res.status(status).json(apiSuccess(data));
export function pagination(query) {
  if (Object.keys(query).some(key => !['page', 'limit'].includes(key))) fail();
  const page = query.page === undefined ? 1 : Number(query.page);
  const limit = query.limit === undefined ? 20 : Number(query.limit);
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger((page - 1) * limit) || Object.values(query).some(value => typeof value !== 'string' || !/^\d+$/.test(value))) fail();
  return { page, limit };
}
export const paged = (items, total, { page, limit }) => ({ items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });