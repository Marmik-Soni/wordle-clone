import type { Response } from "express";
import type { AuthRequest } from "../middleware/auth.middleware.js";
import {
  getOrCreateSession,
  submitGuess,
  updateUserStats,
} from "../services/game.service.js";
import { getDailyWord } from "../services/dailyWord.service.js";
import { logger } from "../utils/logger.js";

export async function getTodayMeta(
  req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    const daily = await getDailyWord();
    res.json({
      date: daily.date,
      wordNumber: daily.wordNumber,
    });
  } catch (error) {
    logger.error("❌ Failed to get today meta", {
      error: error instanceof Error ? error.message : String(error)
    });
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function getSession(
  req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    const userId = req.user?.userId ?? null;
    const guestSessionId = (req.query.sessionId as string) ?? null;

    const sessionState = await getOrCreateSession(userId, guestSessionId);
    res.json({ session: sessionState });
  } catch (error) {
    logger.error("❌ Failed to get session", { error });
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function guess(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId ?? null;
    const { sessionId, guess: guessWord } = req.body as {
      sessionId: string;
      guess: string;
    };

    if (!sessionId || !guessWord) {
      res.status(400).json({ error: "sessionId and guess are required" });
      return;
    }

    const { result, sessionState, correctWord } = await submitGuess(
      sessionId,
      guessWord,
      userId
    );

    // Update stats if game just completed and user is authenticated
    if (sessionState.completed && userId) {
      await updateUserStats(
        userId,
        sessionState.won,
        sessionState.won ? 6 - sessionState.remainingGuesses : null,
        sessionState.date
      );
    }

    res.json({
      result,
      session: sessionState,
      ...(correctWord && { correctWord }),
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";

    const clientErrors = [
      "Session not found",
      "Game already completed",
      "Maximum guesses reached",
      "Invalid word",
      "Word not in dictionary",
      "Unauthorized",
    ];

    if (clientErrors.includes(message)) {
      res.status(400).json({ error: message });
      return;
    }

    logger.error("❌ Guess error", { error });
    res.status(500).json({ error: "Internal server error" });
  }
}
