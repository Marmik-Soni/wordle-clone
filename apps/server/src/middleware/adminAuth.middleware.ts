import { timingSafeEqual } from "crypto";
import type { Request, Response, NextFunction } from "express";
import { env } from "../config/env.js";
import { UnauthorizedError, ForbiddenError } from "../utils/errors.js";

/**
 * Middleware that requires a valid `x-admin-key` header.
 * Used to protect internal/admin endpoints like the word pipeline.
 * Comparison is timing-safe to prevent timing-based key enumeration.
 */
export function adminAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const providedKey = req.headers["x-admin-key"];

  if (!providedKey || typeof providedKey !== "string") {
    throw new UnauthorizedError(
      "Admin key required — provide x-admin-key header",
      "ADMIN_KEY_MISSING"
    );
  }

  const expected = env.ADMIN_API_KEY;

  // Pad to equal length before comparing to prevent length-leaking attacks
  const bufExpected = Buffer.from(expected);
  const bufProvided = Buffer.alloc(bufExpected.length);
  Buffer.from(providedKey).copy(bufProvided);

  const isValid =
    bufExpected.length === Buffer.from(providedKey).length &&
    timingSafeEqual(bufExpected, bufProvided);

  if (!isValid) {
    throw new ForbiddenError("Invalid admin key", "ADMIN_KEY_INVALID");
  }

  next();
}
