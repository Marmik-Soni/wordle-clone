import { Router } from "express";
import { optionalAuth } from "../middleware/optionalAuth.js";
import { getTodayMeta, getSession, guess } from "../controllers/game.controller.js";
import { catchAsync } from "../utils/catchAsync.js";

const router = Router();

/**
 * @swagger
 * /api/game/today:
 *   get:
 *     summary: Get today's puzzle metadata (date and word number — NOT the word itself)
 *     tags: [Game]
 *     responses:
 *       200:
 *         description: Today's metadata
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 date:
 *                   type: string
 *                   example: "2026-06-25"
 *                 wordNumber:
 *                   type: number
 *                   example: 1
 */
router.get("/today", catchAsync(getTodayMeta));

/**
 * @swagger
 * /api/game/session:
 *   get:
 *     summary: Get or create today's game session
 *     tags: [Game]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: sessionId
 *         schema:
 *           type: string
 *         description: Guest session ID (only for unauthenticated users)
 *     responses:
 *       200:
 *         description: Session state
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 session:
 *                   $ref: '#/components/schemas/GameSession'
 */
router.get("/session", optionalAuth, catchAsync(getSession));

/**
 * @swagger
 * /api/game/guess:
 *   post:
 *     summary: Submit a guess
 *     tags: [Game]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [sessionId, guess]
 *             properties:
 *               sessionId:
 *                 type: string
 *                 description: Session ID from GET /api/game/session
 *               guess:
 *                 type: string
 *                 minLength: 5
 *                 maxLength: 5
 *                 example: CRANE
 *     responses:
 *       200:
 *         description: Guess result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 result:
 *                   $ref: '#/components/schemas/GuessResult'
 *                 session:
 *                   $ref: '#/components/schemas/GameSession'
 *                 correctWord:
 *                   type: string
 *                   description: Only present when game is lost
 *       400:
 *         description: Invalid guess or game already completed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post("/guess", optionalAuth, catchAsync(guess));

export default router;
