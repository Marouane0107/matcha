import { ERROR_CODES } from "@matcha/shared";
import type { ErrorCode } from "@matcha/shared";
import { ApiRequestError, TransportError } from "../../../services/api/client";

const messages: Partial<Record<ErrorCode, string>> = {
  [ERROR_CODES.INVALID_CURRENT_PASSWORD]: "Your current password is incorrect. Please try again.",
  [ERROR_CODES.INVALID_EMAIL_CHANGE_TOKEN]: "This email-change link is invalid or has expired. Request another change from account settings.",
  [ERROR_CODES.PROFILE_NOT_FOUND]: "This profile is unavailable. It may not exist or may not be accessible to you.",
  [ERROR_CODES.NOT_FOUND]: "This item is no longer available. Reload and try again.",
  [ERROR_CODES.UPLOAD_INVALID_TYPE]: "Choose a valid JPEG, PNG or WebP picture.",
  [ERROR_CODES.UPLOAD_TOO_LARGE]: "Choose a picture no larger than 5 MiB and 20 megapixels.",
  [ERROR_CODES.UPLOAD_LIMIT_REACHED]: "You can have up to five photos. Remove one before adding another.",
  [ERROR_CODES.VALIDATION_ERROR]: "Check your details and try again.",
  [ERROR_CODES.UNAUTHORIZED]: "Your session has ended. Please log in again.",
  [ERROR_CODES.FORBIDDEN]: "You don't have permission to do that.",
  [ERROR_CODES.INVALID_CREDENTIALS]: "That username and password don't match.",
  [ERROR_CODES.EMAIL_NOT_VERIFIED]: "Verify your email before logging in.",
  [ERROR_CODES.EMAIL_ALREADY_EXISTS]: "That email address is already registered.",
  [ERROR_CODES.USERNAME_ALREADY_EXISTS]: "That username is already taken.",
  [ERROR_CODES.INVALID_VERIFICATION_TOKEN]: "This verification link is invalid or has expired. Request a new one.",
  [ERROR_CODES.INVALID_RESET_TOKEN]: "This reset link is invalid or has expired. Request a new one.",
  [ERROR_CODES.PASSWORD_TOO_COMMON]: "Choose a less common password that hasn't appeared in known password leaks.",
  [ERROR_CODES.RATE_LIMITED]: "Too many attempts. Wait a moment before trying again.",
  [ERROR_CODES.INTERNAL_ERROR]: "Something went wrong on the server. Please try again later.",
};

export function errorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) return messages[error.error.code] ?? "This request could not be completed.";
  if (error instanceof TransportError) {
    if (error.kind === "network") return "Couldn't reach Matcha. Check your connection and try again.";
    if (error.kind === "timeout") return "The request took too long. Please try again.";
    if (error.kind === "configuration") return "The API address is not configured correctly.";
    return "The server returned an unexpected response. Please try again later.";
  }
  return "Something went wrong. Please try again.";
}
