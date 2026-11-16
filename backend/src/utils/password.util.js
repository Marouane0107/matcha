import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import argon2 from 'argon2';

export const isPasswordStrong = (password) => {
  return typeof password === 'string' && [...password].length >= 12 && [...password].length <= 128 && /\p{L}/u.test(password) && /\p{N}/u.test(password);
};

export const passwordDenylistVersion = 'matcha-local-2026-11-16';
const common = new Set('password passwordpassword letmein welcome qwerty iloveyou admin administrator monkey dragon football baseball sunshine princess trustno1 abcdef abcdefgh english computer internet secret login master hello changeme security superman batman michael jennifer charlie donald summer winter spring autumn november december january october september august april march february correcthorsebatterystaple'.split(' '));
export const isCommonPassword = password => {
  const normalized = password.normalize('NFKC').toLowerCase();
  const candidate = normalized.replace(/[^a-z0-9]/g, '').replace(/^\d+|\d+$/g, '');
  return common.has(normalized) || common.has(candidate) || /^(password|qwerty|letmein|welcome|iloveyou|admin|123456)/.test(normalized);
};
const digest = password => crypto.createHash('sha256').update(password, 'utf8').digest('base64');

export const hashPassword = async (password) => {
  return argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
};

export const verifyPassword = async (password, hash) => {
  if (typeof password !== 'string' || typeof hash !== 'string') return false;
  if (hash.startsWith('$argon2id$')) return argon2.verify(hash, password);
  if (hash.startsWith('sha256:')) return bcrypt.compare(digest(password), hash.slice(7));
  return Buffer.byteLength(password, 'utf8') <= 72 && bcrypt.compare(password, hash);
};
