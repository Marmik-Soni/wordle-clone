import winston from "winston";
import { env } from "../config/env.js";

const devFormat = winston.format.printf(({ level, message, timestamp, ...meta }) => {
  const emoji = {
    info: "ℹ️ ",
    warn: "⚠️ ",
    error: "❌",
    debug: "🔍",
  }[level] ?? "📋";

  const metaStr = Object.keys(meta).length
    ? "\n   " + JSON.stringify(meta, null, 2).split("\n").join("\n   ")
    : "";

  return `${emoji}  [${timestamp}] ${message}${metaStr}`;
});

export const logger = winston.createLogger({
  level: env.NODE_ENV === "production" ? "info" : "debug",
  format: winston.format.combine(
    winston.format.timestamp({ format: "HH:mm:ss" }),
    winston.format.errors({ stack: true }),
    env.NODE_ENV === "production"
      ? winston.format.json()
      : devFormat
  ),
  transports: [new winston.transports.Console()],
});
