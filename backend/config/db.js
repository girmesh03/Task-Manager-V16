// backend/config/db.js
import mongoose from "mongoose";

// Using Infinity for continuous retries
const INITIAL_RETRY_DELAY = 1000;
const MAX_RETRY_DELAY = 30000; // Cap at 30 seconds
let retryCount = 0;
let isConnecting = false;

const connectWithRetry = async () => {
  if (mongoose.connection.readyState >= 1) return;
  if (isConnecting) return;

  isConnecting = true;

  try {
    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI environment variable not defined");
    }

    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
      minPoolSize: 2,
    });

    console.log("💾 Connected to MongoDB successfully.");
    retryCount = 0;
  } catch (error) {
    console.error(`MongoDB connection error: ${error.message}`);

    // Calculate delay with exponential backoff, but cap it
    const delay = Math.min(
      INITIAL_RETRY_DELAY * Math.pow(2, retryCount),
      MAX_RETRY_DELAY
    );
    retryCount++;
    console.warn(
      `Retrying connection in ${delay}ms... (Attempt ${retryCount})`
    );
    setTimeout(connectWithRetry, delay);
    return;
  } finally {
    isConnecting = false;
  }
};

// Monitor connection state periodically
const monitorConnection = () => {
  setInterval(() => {
    const state = mongoose.connection.readyState;
    const stateMap = {
      0: "disconnected",
      1: "connected",
      2: "connecting",
      3: "disconnecting",
    };
    
    if (state !== 1 && !isConnecting) {
      console.log(`MongoDB connection state: ${stateMap[state] || "unknown"} (${state})`);
      if (state === 0) {
        console.log("Attempting to reconnect to MongoDB...");
        connectWithRetry();
      }
    }
  }, 30000); // Check every 30 seconds
};

const connectDB = async () => {
  await connectWithRetry();
  monitorConnection();
  return mongoose.connection;
};

mongoose.connection.on("connecting", () => {
  console.log("Attempting to connect to MongoDB...");
});

mongoose.connection.on("connected", () => {
  console.log("MongoDB connection re-established.");
});

mongoose.connection.on("disconnected", () => {
  console.log("🔌 MongoDB connection lost. Attempting to reconnect...");
  if (!isConnecting && mongoose.connection.readyState !== 1) {
    // Reset retry count on disconnection to avoid excessive delays
    retryCount = 0;
    setTimeout(connectWithRetry, 1000);
  }
});

mongoose.connection.on("error", (err) => {
  if (err.name === "MongoServerSelectionError") {
    console.warn("MongoDB server selection error, will retry...");
  } else {
    console.error("❌ MongoDB connection error:", err.message);
  }
});

export default connectDB;
