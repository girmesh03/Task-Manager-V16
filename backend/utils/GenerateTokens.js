// backend/utils/generateTokens.js
import jwt from "jsonwebtoken";

// Defaults based on environment
const DEFAULT_ACCESS_EXPIRES_IN =
  process.env.NODE_ENV === "production" ? "15m" : "1d";
const DEFAULT_REFRESH_EXPIRES_IN = "7d";

const accessExpiresInEnv =
  process.env.JWT_ACCESS_EXPIRES_IN || DEFAULT_ACCESS_EXPIRES_IN;
const refreshExpiresInEnv =
  process.env.JWT_REFRESH_EXPIRES_IN || DEFAULT_REFRESH_EXPIRES_IN;

// Convert expiresIn string to milliseconds
const expiresInToMs = (expiresIn) => {
  if (typeof expiresIn === "number") {
    return expiresIn * 1000;
  }

  const match = String(expiresIn).match(/^(\d+)([smhd])$/);
  if (match) {
    const value = parseInt(match[1], 10);
    const unit = match[2];
    const multipliers = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };
    return value * multipliers[unit];
  }

  // Fallback to 15 minutes if format is unrecognized
  console.warn(
    `Unsupported expiresIn format: ${expiresIn}. Using fallback value.`
  );
  return 15 * 60 * 1000;
};

// Calculate cookie maxAge values
const ACCESS_TOKEN_MAX_AGE = expiresInToMs(accessExpiresInEnv);
const REFRESH_TOKEN_MAX_AGE = expiresInToMs(refreshExpiresInEnv);

export const generateAccessToken = (userId) => {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) throw new Error("JWT_ACCESS_SECRET not set");
  return jwt.sign({ userId }, secret, {
    expiresIn: accessExpiresInEnv,
  });
};

export const generateRefreshToken = (userId) => {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret) throw new Error("JWT_REFRESH_SECRET not set");
  return jwt.sign({ userId }, secret, {
    expiresIn: refreshExpiresInEnv,
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
