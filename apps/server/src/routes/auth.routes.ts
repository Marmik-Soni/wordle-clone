import { Router } from "express";
import { register, login, refresh, logout } from "../controllers/auth.controller.js";
import { catchAsync } from "../utils/catchAsync.js";
import { authRateLimiter } from "../middleware/rateLimiter.js";

const router = Router();

router.post("/register", authRateLimiter, catchAsync(register));
router.post("/login", authRateLimiter, catchAsync(login));
router.post("/refresh", catchAsync(refresh));
router.post("/logout", catchAsync(logout));

export default router;
