// backend/config/db.js
import mongoose from "mongoose";

const MAX_RETRIES = 5;
const INITIAL_RETRY_DELAY = 1000;
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

    if (retryCount < MAX_RETRIES) {
      const delay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount);
      retryCount++;
      console.warn(
        `Retrying connection in ${delay}ms... (${retryCount}/${MAX_RETRIES})`
      );
      setTimeout(connectWithRetry, delay);
      return;
    }

    console.error("💥 MongoDB connection failed after maximum retries");
    throw error;
  } finally {
    isConnecting = false;
  }
};

const connectDB = async () => {
  await connectWithRetry();
};

mongoose.connection.on("connecting", () => {
  console.log("Attempting to connect to MongoDB...");
});

mongoose.connection.on("connected", () => {
  console.log("MongoDB connection re-established.");
});

mongoose.connection.on("disconnected", () => {
  console.log("🔌 MongoDB connection lost. Attempting to reconnect...");
  if (!isConnecting) {
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
