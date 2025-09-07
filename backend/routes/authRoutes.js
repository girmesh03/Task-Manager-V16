// backend/routes/authRoutes.js
import express from "express";

import rateLimiter from "../middlewares/rateLimiter.js";

const router = express.Router();

// Apply rate limiter to all auth routes
router.use(rateLimiter);

router.get("/test", (req, res) => {
  res.json({ message: "Auth route is working!" });
});

export default router;
