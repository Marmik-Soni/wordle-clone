import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { User } from "../models/User.js";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  type TokenPayload,
} from "../utils/jwt.js";
import { logger } from "../utils/logger.js";
import { BadRequestError, ConflictError, UnauthorizedError } from "../utils/errors.js";

export async function register(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as { email: string; password: string };

  if (!email || !password) {
    throw new BadRequestError("Email and password are required", "VALIDATION_ERROR");
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
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

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

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    logger.warn(`⚠️  Failed login attempt - user not found: ${email}`);
    throw new UnauthorizedError("Invalid credentials", "INVALID_CREDENTIALS");
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    logger.warn(`⚠️  Failed login attempt - wrong password for: ${email}`);
    throw new UnauthorizedError("Invalid credentials", "INVALID_CREDENTIALS");
  }

  const payload = { userId: user._id.toString(), email: user.email };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

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

  const user = await User.findById(payload.userId);
  if (!user) {
    throw new UnauthorizedError("User no longer exists", "USER_NOT_FOUND");
  }

  const newPayload = { userId: user._id.toString(), email: user.email };
  const accessToken = signAccessToken(newPayload);
  const newRefreshToken = signRefreshToken(newPayload);

  res.json({ accessToken, refreshToken: newRefreshToken });
}

export async function logout(_req: Request, res: Response): Promise<void> {
  res.json({ message: "Logged out successfully" });
}
