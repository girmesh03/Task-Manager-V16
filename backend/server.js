// backend/server.js
import http from "http";
import mongoose from "mongoose";
import app from "./app.js";

import connectDB from "./config/db.js";

const PORT = parseInt(process.env.PORT || "5000", 10);
const GRACEFUL_SHUTDOWN_TIMEOUT = 10000;

const server = http.createServer(app);

const startServer = async () => {
  try {
    // Connect to MongoDB
    await connectDB();

    // Start HTTP server
    server.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`⚙️  Environment: ${process.env.NODE_ENV || "development"}`);
      console.log(`📅 Server Time: ${new Date().toISOString()}`);
    });
  } catch (err) {
    console.error("🚨 Server startup failed:", err.message);
    process.exit(1);
  }
};

const shutdown = async () => {
  console.log("🛑 Starting graceful shutdown...");

  try {
    // Close HTTP server
    const serverClosePromise = new Promise((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Set timeout for graceful shutdown
    const timeoutPromise = new Promise((resolve) => {
      setTimeout(() => {
        console.warn("⌛ Graceful shutdown timeout - forcing exit");
        resolve();
      }, GRACEFUL_SHUTDOWN_TIMEOUT);
    });

    await Promise.race([serverClosePromise, timeoutPromise]);
    console.log("✅ HTTP server closed");

    // Close MongoDB connection
    await mongoose.disconnect();
    console.log("✅ MongoDB connection closed");

    console.log("👋 Shutdown complete");
    process.exit(0);
  } catch (err) {
    console.error("❌ Error during shutdown:", err.message);
    process.exit(1);
  }
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

process.on("uncaughtException", (err) => {
  console.error("🛑 Uncaught Exception:", err.message);
  console.error(err.stack);
  shutdown();
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("🛑 Unhandled Rejection at:", promise);
  console.error("Reason:", reason);
});

startServer();
