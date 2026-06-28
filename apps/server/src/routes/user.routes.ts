import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { getStats } from "../controllers/user.controller.js";
import { catchAsync } from "../utils/catchAsync.js";

const router = Router();

/**
 * @swagger
 * /api/user/stats:
 *   get:
 *     summary: Get authenticated user stats
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User stats retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get("/stats", requireAuth, catchAsync(getStats));

export default router;
