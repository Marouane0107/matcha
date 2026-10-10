import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();

const getSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not defined in environment variables");
  return secret;
};

export const generateToken = (payload, expiresIn = process.env.JWT_EXPIRES_IN || '7d') => {
  return jwt.sign(payload, getSecret(), { expiresIn });
};

export const verifyToken = (token) => {
  return jwt.verify(token, getSecret());
};
