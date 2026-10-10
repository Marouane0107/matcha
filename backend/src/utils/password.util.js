import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

/**
 * Checks if a password is strong.
 * Enforces a minimum of 8 characters, at least one uppercase letter,
 * one lowercase letter, one number, and one special character.
 */
export const isPasswordStrong = (password) => {
  const minLength = 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

  return password.length >= minLength && hasUppercase && hasLowercase && hasNumber && hasSpecialChar;
};

export const hashPassword = async (password) => {
  return await bcrypt.hash(password, SALT_ROUNDS);
};

export const verifyPassword = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};
