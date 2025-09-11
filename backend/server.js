// backend/server.js
import http from "http";
import mongoose from "mongoose";
import app from "./app.js";

import connectDB from "./config/db.js";

let PORT = parseInt(process.env.PORT || "5000", 10);
const GRACEFUL_SHUTDOWN_TIMEOUT = 10000;

const server = http.createServer(app);

// Check if port is available
const isPortAvailable = (port) => {
  return new Promise((resolve) => {
    const testServer = http.createServer();
    testServer.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false);
      } else {
        resolve(true);
      }
    });
    testServer.once('listening', () => {
      testServer.close();
      resolve(true);
    });
    testServer.listen(port);
  });
};

const startServer = async () => {
  try {
    // Connect to MongoDB
    await connectDB();

    // Check if port is available
    const portAvailable = await isPortAvailable(PORT);
    if (!portAvailable) {
      console.warn(`⚠️ Port ${PORT} is already in use. Trying port ${PORT + 1}`);
      PORT += 1;
    }

    // Start HTTP server
    server.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`⚙️  Environment: ${process.env.NODE_ENV || "development"}`);
      console.log(`📅 Server Time: ${new Date().toISOString()}`);
    });
  } catch (err) {
    console.error("🚨 Server startup failed:", err.message);
    // Don't exit process on startup failure, let the retry mechanism handle it
    console.log("Attempting to recover from startup failure...");
  }
};

const shutdown = async () => {
  console.log("🛑 Starting graceful shutdown...");
  let exitCode = 0;

  try {
    // Close HTTP server
    const serverClosePromise = new Promise((resolve, reject) => {
      server.close((err) => {
        if (err) {
          console.error("❌ Error closing HTTP server:", err.message);
          exitCode = 1;
          resolve(); // Still resolve to continue shutdown
        } else {
          console.log("✅ HTTP server closed");
          resolve();
        }
      });
    });

    // Set timeout for graceful shutdown
    const timeoutPromise = new Promise((resolve) => {
      setTimeout(() => {
        console.warn("⌛ Graceful shutdown timeout - continuing with remaining tasks");
        resolve();
      }, GRACEFUL_SHUTDOWN_TIMEOUT);
    });

    await Promise.race([serverClosePromise, timeoutPromise]);

    // Close MongoDB connection with timeout
    try {
      const dbDisconnectPromise = mongoose.disconnect();
      const dbTimeoutPromise = new Promise((resolve) => {
        setTimeout(() => {
          console.warn("⌛ MongoDB disconnect timeout - forcing continuation");
          resolve();
        }, 5000); // 5 second timeout for DB disconnect
      });

      await Promise.race([dbDisconnectPromise, dbTimeoutPromise]);
      console.log("✅ MongoDB connection closed");
    } catch (dbErr) {
      console.error("❌ Error disconnecting from MongoDB:", dbErr.message);
      exitCode = 1;
    }

    console.log("👋 Shutdown complete");
    process.exit(exitCode);
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
  // Gracefully shutdown on unhandled rejection instead of crashing
  shutdown();
});

startServer();
