// backend/utils/GenerateTokens.js
import jwt from "jsonwebtoken";

// Token max ages
const ACCESS_TOKEN_MAX_AGE =
  process.env.NODE_ENV === "production"
    ? 15 * 60 * 1000 // 15 minutes
    : 1 * 24 * 60 * 60 * 1000; // 1 day
const REFRESH_TOKEN_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

export const generateAccessToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_ACCESS_SECRET, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES_IN,
  });
};

export const generateRefreshToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN,
  });
};

// Cookie options
export const getAccessTokenCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict",
  maxAge: ACCESS_TOKEN_MAX_AGE,
});

export const getRefreshTokenCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict",
  maxAge: REFRESH_TOKEN_MAX_AGE,
});
