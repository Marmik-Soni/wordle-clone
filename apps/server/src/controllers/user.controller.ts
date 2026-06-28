import type { Response } from "express";
import { User } from "../models/User.js";
import type { AuthRequest } from "../middleware/auth.middleware.js";
import { NotFoundError } from "../utils/errors.js";

export async function getStats(req: AuthRequest, res: Response): Promise<void> {
  const user = await User.findById(req.user?.userId).select("email stats createdAt");
  if (!user) {
    throw new NotFoundError("User not found", "USER_NOT_FOUND");
  }
  res.json({ user });
}
