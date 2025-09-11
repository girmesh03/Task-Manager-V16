// backend/app.js
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import helmet from "helmet";
import compression from "compression";
import mongoSanitize from "express-mongo-sanitize";

import corsOptions from "./config/corsOptions.js";
import globalErrorHandler from "./errorHandler/ErrorController.js";
import CustomError from "./errorHandler/CustomError.js";

// Import routes
import routes from "./routes/index.js";

// Initialize express
const app = express();

// Security and performance middleware
app.use(helmet());
app.use(cors(corsOptions));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(mongoSanitize());
app.use(compression());

// Logging in development
if (process.env.NODE_ENV === "development") app.use(morgan("dev"));

// Main API routes
app.use("/api", routes);

// Catch-all route for undefined endpoints
app.all("*", (req, res, next) => {
  const errorMessage = `Resource not found. The requested URL ${req.originalUrl} was not found on this server.`;
  next(new CustomError(errorMessage, 404, "RESOURCE_NOT_FOUND_ERROR"));
});

// Global error handler
app.use(globalErrorHandler);

export default app;
