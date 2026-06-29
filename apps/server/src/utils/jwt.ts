import jwt from "jsonwebtoken";
import { createHash } from "crypto";
import { env } from "../config/env.js";

export interface TokenPayload {
  userId: string;
  email: string;
}

export function signAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  } as jwt.SignOptions);
}

export function signRefreshToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
  } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, env.JWT_SECRET) as TokenPayload;
}

export function verifyRefreshToken(token: string): TokenPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as TokenPayload;
}

/**
 * SHA-256 hash of a token for safe DB storage.
 * We never store plaintext refresh tokens — only their hashes.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
