import { Router } from "express";
import { triggerWordFetch, getWordCount } from "../controllers/words.controller.js";
import { catchAsync } from "../utils/catchAsync.js";

const router = Router();

/**
 * @swagger
 * /api/words/count:
 *   get:
 *     summary: Get unused word count
 *     tags: [Words]
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
 */
router.get("/count", catchAsync(getWordCount));
/**
 * @swagger
 * /api/words/fetch:
 *   post:
 *     summary: Manually trigger word pipeline refill
 *     tags: [Words]
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
