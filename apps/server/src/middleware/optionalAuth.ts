import type { Response, NextFunction } from "express";
import { verifyAccessToken } from "../utils/jwt.js";
import type { AuthRequest } from "./auth.middleware.js";

export function optionalAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    next();
    return;
  }

  const token = authHeader.split(" ")[1];

  try {
    const payload = verifyAccessToken(token!);
    req.user = payload;
  } catch {
    // Invalid token — continue as guest
  }

  next();
}
