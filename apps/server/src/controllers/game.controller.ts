import mongoose from "mongoose";
import type { Response } from "express";
import type { AuthRequest } from "../middleware/auth.middleware.js";
import {
  getOrCreateSession,
  submitGuess,
  updateUserStats,
} from "../services/game.service.js";
import { getDailyWord } from "../services/dailyWord.service.js";
import { BadRequestError } from "../utils/errors.js";

export async function getTodayMeta(
  req: AuthRequest,
  res: Response
): Promise<void> {
  const daily = await getDailyWord();
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
}
