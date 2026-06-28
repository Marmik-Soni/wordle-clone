import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { getStats } from "../controllers/user.controller.js";
import { catchAsync } from "../utils/catchAsync.js";

const router = Router();

router.get("/stats", requireAuth, catchAsync(getStats));

export default router;
