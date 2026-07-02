import { timingSafeEqual } from "crypto";
import type { Request, Response, NextFunction } from "express";
import { env } from "../config/env.js";
import { UnauthorizedError, ForbiddenError } from "../utils/errors.js";

/** Constant-time string comparison — prevents timing-based key enumeration. */
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Middleware that requires a valid `x-admin-key` header.
 * Used to protect internal/admin endpoints like the word pipeline.
 */
export function adminAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const providedKey = req.headers["x-admin-key"];

  if (!providedKey || typeof providedKey !== "string") {
    next(new UnauthorizedError(
      "Admin key required — provide x-admin-key header",
      "ADMIN_KEY_MISSING"
    ));
    return;
  }

  if (!safeCompare(providedKey, env.ADMIN_API_KEY)) {
    next(new ForbiddenError("Invalid admin key", "ADMIN_KEY_INVALID"));
    return;
  }

  next();
}
