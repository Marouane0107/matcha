import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

/**
 * Checks if a password is strong.
 * Enforces 12..128 Unicode code points with at least one letter and one number,
 * matching the shared frontend validation and the Phase 0 password policy.
 */
export const isPasswordStrong = (password) => {
  const length = [...password].length;
  const hasLetter = /\p{L}/u.test(password);
  const hasNumber = /\p{N}/u.test(password);

  return length >= 12 && length <= 128 && hasLetter && hasNumber;
};

export const hashPassword = async (password) => {
  return await bcrypt.hash(password, SALT_ROUNDS);
};

export const verifyPassword = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};
