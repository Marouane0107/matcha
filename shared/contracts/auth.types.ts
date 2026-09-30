export interface ChangeEmailRequest {
  newEmail: string;
  password: string;
}

export interface VerifyEmailChangeRequest {
  token: string;
}

export interface RegisterRequest {
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  password: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  emailVerified: boolean;
  profileComplete: boolean;
}

export interface AuthResponse {
  user: AuthUser;
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: number;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResendVerificationRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  password: string;
}

export interface VerifyEmailRequest {
  token: string;
}