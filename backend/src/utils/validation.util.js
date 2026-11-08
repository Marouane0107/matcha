const EMAIL_RE = /^[^\s@\p{Cc}]+@[^\s@\p{Cc}]+\.[^\s@\p{Cc}]+$/u;
const USERNAME_RE = /^[a-z][a-z0-9_]{2,29}$/;
const RESERVED_USERNAMES = ['me', 'search', 'suggestions', 'auth', 'api'];

export function isValidEmail(value) {
  return typeof value === 'string' && value.length <= 254 && EMAIL_RE.test(value);
}

export function isValidUsername(value) {
  return typeof value === 'string' && USERNAME_RE.test(value) && !RESERVED_USERNAMES.includes(value);
}

export function isValidName(value) {
  return typeof value === 'string' && [...value].length >= 1 && [...value].length <= 50 && !/\p{Cc}/u.test(value);
}
