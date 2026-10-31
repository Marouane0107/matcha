// Bridge to @matcha/shared — imports constants at runtime from the compiled CJS dist.
// Shared is "type": "commonjs", so we use createRequire to import from an ESM backend.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const shared = require('@matcha/shared');

export const API_ROUTES = shared.API_ROUTES;
export const ERROR_CODES = shared.ERROR_CODES;
export const SOCKET_EVENTS = shared.SOCKET_EVENTS;
export const DEFAULT_SEXUAL_PREFERENCE = shared.DEFAULT_SEXUAL_PREFERENCE;

// Response envelope helpers matching the shared ApiResponse contract:
// ApiSuccess<T> = { success: true, data: T, error: null }
// ApiFailure    = { success: false, data: null, error: { code, message } }

export const apiSuccess = (data) => ({
  success: true,
  data,
  error: null,
});

export const apiError = (code, message) => ({
  success: false,
  data: null,
  error: { code, message },
});
