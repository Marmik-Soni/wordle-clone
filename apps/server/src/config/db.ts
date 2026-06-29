import mongoose from "mongoose";
import { env } from "./env.js";
import { logger } from "../utils/logger.js";

let isConnected = false;

export async function connectDB(): Promise<void> {
  if (isConnected) return;

  try {
    await mongoose.connect(env.MONGODB_URI);
    isConnected = true;
    logger.info("✅ MongoDB connected");
  } catch (error) {
    logger.error("❌ MongoDB connection failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

export async function disconnectDB(): Promise<void> {
  if (!isConnected) return;
  await mongoose.disconnect();
  isConnected = false;
}
