import { Router } from "express";
import { triggerWordFetch, getWordCount } from "../controllers/words.controller.js";
import { catchAsync } from "../utils/catchAsync.js";
import { adminAuth } from "../middleware/adminAuth.middleware.js";

const router = Router();

// Apply admin auth to ALL words routes — these are internal admin endpoints
router.use(adminAuth);

/**
 * @swagger
 * /api/words/count:
 *   get:
 *     summary: Get unused word count (admin only)
 *     tags: [Words]
 *     security:
 *       - adminKey: []
 *     responses:
 *       200:
 *         description: Word count retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 unusedWords:
 *                   type: number
 *       401:
 *         description: Admin key missing
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Invalid admin key
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get("/count", catchAsync(getWordCount));
/**
 * @swagger
 * /api/words/fetch:
 *   post:
 *     summary: Manually trigger word pipeline refill (admin only)
 *     tags: [Words]
 *     security:
 *       - adminKey: []
 *     responses:
 *       200:
 *         description: Pipeline triggered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 result:
 *                   type: object
 *                   properties:
 *                     fetched:
 *                       type: number
 *                     validated:
 *                       type: number
 *                     stored:
 *                       type: number
 *                     duplicates:
 *                       type: number
 */
router.post("/fetch", catchAsync(triggerWordFetch));

export default router;
