// backend/routes/index.js
import express from "express";

import AuthRoutes from "./authRoutes.js";

const router = express.Router();

// Authentication routes
router.use("/auth", AuthRoutes);

export default router;
