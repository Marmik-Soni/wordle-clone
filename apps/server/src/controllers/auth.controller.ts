import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { User } from "../models/User.js";
import { RefreshToken } from "../models/RefreshToken.js";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
  type TokenPayload,
} from "../utils/jwt.js";
import { logger } from "../utils/logger.js";
import { BadRequestError, ConflictError, UnauthorizedError } from "../utils/errors.js";
import { env } from "../config/env.js";

// ── helpers ───────────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Parse JWT_REFRESH_EXPIRES_IN (e.g. "7d", "24h") into milliseconds. */
function parseExpiresInMs(value: string): number {
  const unit = value.slice(-1);
  const amount = parseInt(value.slice(0, -1), 10);
  if (unit === "d") return amount * 86_400_000;
  if (unit === "h") return amount * 3_600_000;
  if (unit === "m") return amount * 60_000;
  return amount * 1000; // assume seconds
}

async function issueTokens(payload: TokenPayload): Promise<{
  accessToken: string;
  refreshToken: string;
}> {
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  const expiresAt = new Date(
    Date.now() + parseExpiresInMs(env.JWT_REFRESH_EXPIRES_IN)
  );

  await RefreshToken.create({
    userId: payload.userId,
    tokenHash: hashToken(refreshToken),
    expiresAt,
  });

  return { accessToken, refreshToken };
}

// ── controllers ───────────────────────────────────────────────────────────────

export async function register(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as { email: string; password: string };

  if (!email || !password) {
    throw new BadRequestError("Email and password are required", "VALIDATION_ERROR");
  }
  if (!EMAIL_RE.test(email)) {
    throw new BadRequestError("Invalid email format", "VALIDATION_ERROR");
  }
  if (password.length < 8) {
    throw new BadRequestError(
      "Password must be at least 8 characters",
      "VALIDATION_ERROR"
    );
  }

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    throw new ConflictError("Email already registered", "EMAIL_ALREADY_EXISTS");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({ email: email.toLowerCase(), passwordHash });

  const payload = { userId: user._id.toString(), email: user.email };
  const { accessToken, refreshToken } = await issueTokens(payload);

  logger.info(`✅ New user registered: ${user.email}`);

  res.status(201).json({
    accessToken,
    refreshToken,
    user: { id: user._id, email: user.email, stats: user.stats },
  });
}

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as { email: string; password: string };

  if (!email || !password) {
    throw new BadRequestError("Email and password are required", "VALIDATION_ERROR");
  }

  // Redact email for logs — show first char + domain only to avoid PII in log pipelines
  const [localPart, domain] = email.split("@");
  const redacted = localPart ? `${localPart[0]}***@${domain ?? "?"}` : "[invalid]";

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    // Intentionally same message as wrong password — avoids user enumeration
    logger.warn(`⚠️  Failed login attempt — not found: ${redacted}`);
    throw new UnauthorizedError("Invalid credentials", "INVALID_CREDENTIALS");
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    logger.warn(`⚠️  Failed login attempt — wrong password: ${redacted}`);
    throw new UnauthorizedError("Invalid credentials", "INVALID_CREDENTIALS");
  }

  const payload = { userId: user._id.toString(), email: user.email };
  const { accessToken, refreshToken } = await issueTokens(payload);

  logger.info(`✅ User logged in: ${user.email}`);

  res.json({
    accessToken,
    refreshToken,
    user: { id: user._id, email: user.email, stats: user.stats },
  });
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const { refreshToken } = req.body as { refreshToken: string };

  if (!refreshToken) {
    throw new BadRequestError("Refresh token required", "REFRESH_TOKEN_REQUIRED");
  }

  // 1. Verify the JWT signature first (fast — no DB hit if invalid)
  let payload: TokenPayload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch (err) {
    if (err instanceof Error && err.name === "TokenExpiredError") {
      throw new UnauthorizedError(
        "Refresh token expired — please log in again",
        "REFRESH_TOKEN_EXPIRED"
      );
    }
    throw new UnauthorizedError("Invalid refresh token", "REFRESH_TOKEN_INVALID");
  }

  // 2. Verify the token exists in the DB (not revoked)
  const tokenHash = hashToken(refreshToken);
  const storedToken = await RefreshToken.findOne({ tokenHash });
  if (!storedToken) {
    // Could be a replayed token — log as a warning
    logger.warn(`🚨 Refresh token not found in DB for user ${payload.userId} — possible replay attack`);
    throw new UnauthorizedError("Refresh token has been revoked", "REFRESH_TOKEN_REVOKED");
  }

  // 3. Verify the token belongs to an existing user
  const user = await User.findById(payload.userId);
  if (!user) {
    await RefreshToken.deleteMany({ userId: payload.userId }); // clean up orphaned tokens
    throw new UnauthorizedError("User no longer exists", "USER_NOT_FOUND");
  }

  // 4. Rotate — delete the old token, issue a fresh pair
  await storedToken.deleteOne();

  const newPayload = { userId: user._id.toString(), email: user.email };
  const { accessToken, refreshToken: newRefreshToken } = await issueTokens(newPayload);

  res.json({ accessToken, refreshToken: newRefreshToken });
}

export async function logout(req: Request, res: Response): Promise<void> {
  const { refreshToken } = req.body as { refreshToken?: string };

  if (refreshToken) {
    // Delete the specific token, invalidating it on the server
    await RefreshToken.deleteOne({ tokenHash: hashToken(refreshToken) });
  }

  res.json({ message: "Logged out successfully" });
}
