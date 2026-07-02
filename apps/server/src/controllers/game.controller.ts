import mongoose from "mongoose";
import type { Response } from "express";
import type { AuthRequest } from "../middleware/auth.middleware.js";
import { getOrCreateSession, submitGuess } from "../services/game.service.js";
import { updateUserStats } from "../services/user.service.js";
import { getDailyWord } from "../services/dailyWord.service.js";
import { BadRequestError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";

export async function getTodayMeta(
  req: AuthRequest,
  res: Response
): Promise<void> {
  // getDailyWord() is synchronous — no await needed
  const daily = getDailyWord();
  res.json({
    date: daily.date,
    wordNumber: daily.wordNumber,
  });
}

export async function getSession(
  req: AuthRequest,
  res: Response
): Promise<void> {
  const userId = req.user?.userId ?? null;
  const guestSessionId = (req.query.sessionId as string) ?? null;

  if (guestSessionId && !mongoose.Types.ObjectId.isValid(guestSessionId)) {
    throw new BadRequestError("Invalid sessionId format", "INVALID_SESSION_ID");
  }

  const sessionState = await getOrCreateSession(userId, guestSessionId);
  res.json({ session: sessionState });
}

export async function guess(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user?.userId ?? null;
  const { sessionId, guess: guessWord } = req.body as {
    sessionId: string;
    guess: string;
  };

  if (!sessionId || !guessWord) {
    throw new BadRequestError(
      "sessionId and guess are required",
      "VALIDATION_ERROR"
    );
  }

  const { result, sessionState, correctWord } = await submitGuess(
    sessionId,
    guessWord,
    userId
  );

  // Update stats if this game just completed for an authenticated user.
  // Wrapped in try/catch so a stats failure never corrupts the game response —
  // the game result is the source of truth; stats can be reconciled if needed.
  if (sessionState.completed && userId) {
    try {
      await updateUserStats(
        userId,
        sessionState.won,
        sessionState.won ? 6 - sessionState.remainingGuesses : null,
        sessionState.date
      );
    } catch (statsErr) {
      logger.error("❌ Stats update failed after game completion — game result is unaffected", {
        userId,
        sessionId,
        error: statsErr instanceof Error ? statsErr.message : String(statsErr),
      });
    }
  }

  res.json({
    result,
    session: sessionState,
    ...(correctWord && { correctWord }),
  });
}
