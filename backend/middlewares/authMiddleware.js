// backend/middlewares/authMiddleware.js
import jwt from "jsonwebtoken";
import { User } from "../models/index.js";
import checkUserStatus from "../utils/userStatus.js";
import CustomError from "../errorHandler/CustomError.js";

/**
 * Extract JWT from either the httpOnly cookie or the Authorization header.
 */
function extractRefreshToken(req) {
  const cookieToken = req.cookies?.refresh_token;
  return cookieToken || null;
}

// Middleware to verify refresh token for token refresh route
export const verifyRefreshToken = async (req, res, next) => {
  try {
    // 1) Extract refresh token
    const refreshToken = extractRefreshToken(req);
    if (!refreshToken) {
      return next(
        new CustomError(
          "Refresh token is required",
          401,
          "REFRESH_TOKEN_ERROR"
        )
      );
    }

    // 2) Verify refresh token
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    } catch (jwtError) {
      if (jwtError.name === "TokenExpiredError") {
        return next(
          new CustomError(
            "Refresh token has expired",
            401,
            "REFRESH_TOKEN_EXPIRED_ERROR"
          )
        );
      } else {
        return next(
          new CustomError(
            "Invalid refresh token",
            401,
            "INVALID_REFRESH_TOKEN_ERROR"
          )
        );
      }
    }

    // 3) Load user
    const user = await User.findById(decoded.userId)
      .populate({ path: "organization", select: "name isDeleted" })
      .populate({
        path: "department",
        select: "name organization isDeleted",
      });

    if (!user) {
      return next(
        new CustomError("User not found", 401, "USER_NOT_FOUND_ERROR")
      );
    }

    // 4) Status checks for user
    const userStatus = checkUserStatus(user);
    if (userStatus.status) {
      return next(
        new CustomError(userStatus.message, 401, userStatus.errorCode)
      );
    }

    // Attach user to request
    req.user = user;

    return next();
  } catch (error) {
    return next(
      new CustomError(
        `Internal server error during refresh token verification: ${error.message}`,
        500,
        "REFRESH_TOKEN_VERIFICATION_ERROR"
      )
    );
  }
};

/**
 * Extract JWT from either the httpOnly cookie or the Authorization header.
 */
function extractAccessToken(req) {
  const cookieToken = req.cookies?.access_token;
  const authHeader = req.headers?.authorization || req.headers?.Authorization;
  if (cookieToken) return cookieToken;
  if (authHeader && typeof authHeader === "string") {
    const parts = authHeader.split(" ");
    if (parts.length === 2) {
      const scheme = parts[0];
      const token = parts[1];
      if (
        typeof scheme === "string" &&
        scheme.toLowerCase() === "bearer" &&
        token
      )
        return token;
    }
  }
  return null;
}

// Middleware to verify JWT token with multi-tenant integrity and externalized Subscription
export const verifyJWT = async (req, res, next) => {
  try {
    // 1) Extract token
    const token = extractAccessToken(req);
    if (!token) {
      return next(
        new CustomError(
          "Access token is required",
          401,
          "AUTHENTICATION_TOKEN_ERROR"
        )
      );
    }

    // 2) Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    } catch (jwtError) {
      if (jwtError.name === "TokenExpiredError") {
        return next(
          new CustomError(
            "Access token has expired",
            401,
            "TOKEN_EXPIRED_ERROR"
          )
        );
      } else if (jwtError.name === "JsonWebTokenError") {
        return next(
          new CustomError("Invalid access token", 401, "INVALID_TOKEN_ERROR")
        );
      } else {
        return next(
          new CustomError(
            "Token verification failed",
            401,
            "TOKEN_VERIFICATION_FAILED_ERROR"
          )
        );
      }
    }

    // 3) Load user with tenant context (organization & department)
    const user = await User.findById(decoded.userId)
      .populate({ path: "organization", select: "name isDeleted" })
      .populate({
        path: "department",
        select: "name organization isDeleted",
      });

    if (!user) {
      return next(
        new CustomError("User not found", 401, "USER_NOT_FOUND_ERROR")
      );
    }

    // 4) Status checks for user, department and organization
    const userStatus = checkUserStatus(user);
    if (userStatus.status) {
      return next(
        new CustomError(userStatus.message, 401, userStatus.errorCode)
      );
    }

    // Attach context to request
    req.user = user;

    return next();
  } catch (error) {
    return next(
      new CustomError(
        `Internal server error during authentication: ${error.message}`,
        500,
        "AUTHENTICATION_ERROR"
      )
    );
  }
};
