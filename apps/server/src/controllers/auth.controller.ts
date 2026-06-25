import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { User } from "../models/User.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../utils/jwt.js";
import { logger } from "../utils/logger.js";

export async function register(req: Request, res: Response): Promise<void> {
  try {
    const { email, password } = req.body as { email: string; password: string };

    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required" });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters" });
      return;
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await User.create({
      email: email.toLowerCase(),
      passwordHash,
    });

    const payload = { userId: user._id.toString(), email: user.email };
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    logger.info(`✅ New user registered: ${user.email}`);

    res.status(201).json({
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        email: user.email,
        stats: user.stats,
      },
    });
  } catch (error) {
    logger.error("❌ Register error", { error });
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function login(req: Request, res: Response): Promise<void> {
  try {
    const { email, password } = req.body as { email: string; password: string };

    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required" });
      return;
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const payload = { userId: user._id.toString(), email: user.email };
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    logger.info(`✅ User logged in: ${user.email}`);

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        email: user.email,
        stats: user.stats,
      },
    });
  } catch (error) {
    logger.error("❌ Login error", { error });
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function refresh(req: Request, res: Response): Promise<void> {
  try {
    const { refreshToken } = req.body as { refreshToken: string };

    if (!refreshToken) {
      res.status(400).json({ error: "Refresh token required" });
      return;
    }

    const payload = verifyRefreshToken(refreshToken);

    const user = await User.findById(payload.userId);
    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }

    const newPayload = { userId: user._id.toString(), email: user.email };
    const accessToken = signAccessToken(newPayload);
    const newRefreshToken = signRefreshToken(newPayload);

    res.json({ accessToken, refreshToken: newRefreshToken });
  } catch (error) {
    logger.error("❌ Refresh error", { error });
    res.status(401).json({ error: "Invalid or expired refresh token" });
  }
}

export async function logout(_req: Request, res: Response): Promise<void> {
  // Stateless JWT — client drops the token
  res.json({ message: "Logged out successfully" });
}
