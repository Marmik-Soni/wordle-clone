import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken, type TokenPayload } from "../utils/jwt.js";
import { UnauthorizedError } from "../utils/errors.js";

export interface AuthRequest extends Request {
  user?: TokenPayload;
}

export function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new UnauthorizedError("No token provided", "UNAUTHORIZED");
  }

  const token = authHeader.split(" ")[1];

  try {
    const payload = verifyAccessToken(token!);
    req.user = payload;
    next();
  } catch {
    throw new UnauthorizedError("Invalid or expired token", "UNAUTHORIZED");
  }
}
