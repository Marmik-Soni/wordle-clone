import type { Response } from "express";
import { User } from "../models/User.js";
import { logger } from "../utils/logger.js";
import type { AuthRequest } from "../middleware/auth.middleware.js";

export async function getStats(req: AuthRequest, res: Response): Promise<void> {
  try {
    const user = await User.findById(req.user?.userId).select("email stats createdAt");
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json({ user });
  } catch (error) {
    logger.error("❌ Get stats error", { error });
    res.status(500).json({ error: "Internal server error" });
  }
}
