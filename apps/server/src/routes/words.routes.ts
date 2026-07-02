// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  WORD PIPELINE — DISABLED                                                ║
// ║                                                                          ║
// ║  The AI word-generation pipeline is intentionally turned off.            ║
// ║  The daily word is served from the static JSON word lists in             ║
// ║  src/data/ (answerWords.json + validWords.json) which already contain    ║
// ║  enough entries for years of gameplay.                                   ║
// ║                                                                          ║
// ║  To re-enable:                                                           ║
// ║    1. Uncomment the router.use(adminAuth) line below.                    ║
// ║    2. Uncomment the two router.get / router.post handlers.               ║
// ║    3. Set GOOGLE_AI_API_KEY and ADMIN_API_KEY in .env.                   ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import { Router } from "express";
// import { triggerWordFetch, getWordCount } from "../controllers/words.controller.js";
// import { catchAsync } from "../utils/catchAsync.js";
// import { adminAuth } from "../middleware/adminAuth.middleware.js";

const router = Router();

// ── All word pipeline routes are disabled. ──────────────────────────────────
//
// router.use(adminAuth);
//
// /**
//  * @swagger
//  * /api/words/count:
//  *   get:
//  *     summary: Get unused word count (admin only)
//  *     tags: [Words]
//  *     security:
//  *       - adminKey: []
//  *     responses:
//  *       200:
//  *         description: Word count retrieved
//  *         content:
//  *           application/json:
//  *             schema:
//  *               type: object
//  *               properties:
//  *                 unusedWords:
//  *                   type: number
//  *       401:
//  *         description: Admin key missing
//  *       403:
//  *         description: Invalid admin key
//  */
// router.get("/count", catchAsync(getWordCount));
//
// /**
//  * @swagger
//  * /api/words/fetch:
//  *   post:
//  *     summary: Manually trigger word pipeline refill (admin only)
//  *     tags: [Words]
//  *     security:
//  *       - adminKey: []
//  *     responses:
//  *       200:
//  *         description: Pipeline triggered successfully
//  */
// router.post("/fetch", catchAsync(triggerWordFetch));

export default router;
