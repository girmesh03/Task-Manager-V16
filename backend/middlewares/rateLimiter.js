// backend/middlewares/rateLimiter.js
import rateLimit from "express-rate-limit";

const windowMinutes = process.env.NODE_ENV === "production" ? 15 : 60;
const maxRequests = process.env.NODE_ENV === "production" ? 100 : 500;

const authLimiter = rateLimit({
  windowMs: windowMinutes * 60 * 1000,
  max: maxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV === "development",
  message: {
    success: false,
    message: "Too many requests, please try again later",
    errorCode: "TOO_MANY_REQUESTS_ERROR",
  },
});

export default authLimiter;
