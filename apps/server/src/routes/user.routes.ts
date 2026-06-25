import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { getStats } from "../controllers/user.controller.js";

const router = Router();

router.get("/stats", requireAuth, getStats);

export default router;
