import { API_ROUTES } from "@matcha/shared";
import type { Acknowledgement, AuthResponse, AuthUser, ForgotPasswordRequest, LoginRequest, RegisterRequest, ResendVerificationRequest, ResetPasswordRequest, VerifyEmailRequest } from "@matcha/shared";
import { createApiClient, isRecord } from "../../../services/api/client";

export interface AuthService {
  register: (request: RegisterRequest) => Promise<Acknowledgement>;
  login: (request: LoginRequest) => Promise<AuthResponse>;
  verifyEmail: (request: VerifyEmailRequest) => Promise<Acknowledgement>;
  resendVerification: (request: ResendVerificationRequest) => Promise<Acknowledgement>;
  forgotPassword: (request: ForgotPasswordRequest) => Promise<Acknowledgement>;
  resetPassword: (request: ResetPasswordRequest) => Promise<Acknowledgement>;
  me: (accessToken: string) => Promise<AuthUser>;
  logout: (accessToken: string) => Promise<void>;
}

export function isAuthUser(value: unknown): value is AuthUser {
  return isRecord(value) && ["id", "username", "email", "firstName", "lastName"].every(key => typeof value[key] === "string") &&
    typeof value.emailVerified === "boolean" && typeof value.profileComplete === "boolean";
}

export function isAuthResponse(value: unknown): value is AuthResponse {
  return isRecord(value) && isAuthUser(value.user) && value.user.emailVerified &&
    typeof value.accessToken === "string" && value.accessToken.length > 0 && value.tokenType === "Bearer" &&
    typeof value.expiresIn === "number" && Number.isInteger(value.expiresIn) && value.expiresIn > 0 && value.expiresIn <= 900;
}

const isAcknowledgement = (value: unknown): value is Acknowledgement => isRecord(value) && typeof value.message === "string";

export function createRealAuthService(client: ReturnType<typeof createApiClient>): AuthService {
  const post = (path: string, body: unknown, status = 200) => client.request(path, { method: "POST", body, status, validate: isAcknowledgement });
  return {
    register: body => post(API_ROUTES.AUTH.REGISTER, body, 201),
    login: body => client.request(API_ROUTES.AUTH.LOGIN, { method: "POST", body, status: 200, validate: isAuthResponse }),
    verifyEmail: body => post(API_ROUTES.AUTH.VERIFY_EMAIL, body),
    resendVerification: body => post(API_ROUTES.AUTH.RESEND_VERIFICATION, body),
    forgotPassword: body => post(API_ROUTES.AUTH.FORGOT_PASSWORD, body),
    resetPassword: body => post(API_ROUTES.AUTH.RESET_PASSWORD, body),
    me: accessToken => client.request(API_ROUTES.AUTH.ME, { accessToken, status: 200, validate: isAuthUser }),
    logout: accessToken => client.request(API_ROUTES.AUTH.LOGOUT, { method: "POST", accessToken, status: 204, validate: (value): value is undefined => value === undefined }),
  };
}
