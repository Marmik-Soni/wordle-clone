import type { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import { AppError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // 1. Errors we threw ourselves — trust them completely
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error(`❌ ${err.code}`, { error: err.message, stack: err.stack });
    }
    res.status(err.statusCode).json({
      error: { message: err.message, code: err.code },
    });
    return;
  }

  // 2. Mongoose — bad ObjectId (e.g. a literal "string" sent as sessionId)
  if (err instanceof mongoose.Error.CastError) {
    res.status(400).json({
      error: { message: `Invalid ${err.path}: ${err.value}`, code: "CAST_ERROR" },
    });
    return;
  }

  // 3. Mongoose — schema validation failure
  if (err instanceof mongoose.Error.ValidationError) {
    const firstMessage =
      Object.values(err.errors)[0]?.message ?? "Validation failed";
    res.status(400).json({
      error: { message: firstMessage, code: "VALIDATION_ERROR" },
    });
    return;
  }

  // 4. MongoDB duplicate key (race condition on unique index, e.g. email)
  if ((err as any).code === 11000) {
    res.status(409).json({
      error: { message: "Resource already exists", code: "DUPLICATE_KEY" },
    });
    return;
  }

  // 5. MongoDB cluster unreachable (ReplicaSetNoPrimary / IP not whitelisted / paused cluster)
  if (
    err.name === "MongoServerSelectionError" ||
    err.name === "MongooseServerSelectionError"
  ) {
    logger.error("❌ Database unreachable", { error: err.message });
    res.status(503).json({
      error: {
        message: "Database temporarily unavailable — please try again shortly",
        code: "DB_UNAVAILABLE",
      },
    });
    return;
  }

  // 6. JWT errors that slipped through unwrapped
  if (err.name === "TokenExpiredError") {
    res.status(401).json({
      error: { message: "Token expired", code: "TOKEN_EXPIRED" },
    });
    return;
  }
  if (err.name === "JsonWebTokenError") {
    res.status(401).json({
      error: { message: "Invalid token", code: "TOKEN_INVALID" },
    });
    return;
  }

  // 7. Malformed JSON body
  if ((err as any).type === "entity.parse.failed") {
    res.status(400).json({
      error: { message: "Malformed JSON in request body", code: "MALFORMED_JSON" },
    });
    return;
  }

  // 8. Payload too large
  if ((err as any).type === "entity.too.large") {
    res.status(413).json({
      error: { message: "Request body too large", code: "PAYLOAD_TOO_LARGE" },
    });
    return;
  }

  // 9. Truly unknown — the ONLY path that should produce a 500
  logger.error("❌ Unhandled error", { error: err.message, stack: err.stack });
  res.status(500).json({
    error: { message: "Internal server error", code: "INTERNAL_ERROR" },
  });
}
