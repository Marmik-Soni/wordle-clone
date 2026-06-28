import mongoose from "mongoose";
import { GameSession } from "../models/GameSession.js";
import { Word } from "../models/Word.js";
import { getDailyWord } from "./dailyWord.service.js";
import { calculateColors } from "../utils/colorCalculator.js";
import { isValidWord, sanitizeWord } from "../utils/wordValidator.js";
import { logger } from "../utils/logger.js";
import {
  BadRequestError,
  NotFoundError,
  ConflictError,
  ForbiddenError,
  UnprocessableEntityError,
  ServiceUnavailableError,
} from "../utils/errors.js";
import type { GuessResult, GameStatus } from "@wordle/shared";

export interface SessionState {
  sessionId: string;
  date: string;
  wordNumber: number;
  guesses: GuessResult[];
  completed: boolean;
  won: boolean;
  remainingGuesses: number;
  status: GameStatus;
}

function buildSessionState(
  session: InstanceType<typeof GameSession>,
  dailyWord: string,
  wordNumber: number
): SessionState {
  const guesses: GuessResult[] = session.guesses.map((guess) => ({
    guess,
    colors: calculateColors(guess, dailyWord),
  }));

  const status: GameStatus = !session.completed
    ? "playing"
    : session.won
    ? "won"
    : "lost";

  return {
    sessionId: session._id.toString(),
    date: session.date,
    wordNumber,
    guesses,
    completed: session.completed,
    won: session.won,
    remainingGuesses: 6 - session.guesses.length,
    status,
  };
}

export async function getOrCreateSession(
  userId: string | null,
  guestSessionId: string | null
): Promise<SessionState> {
  const daily = await getDailyWord();
  const today = daily.date;

  let session = null;

  if (userId) {
    session = await GameSession.findOne({ userId, date: today });
  } else if (guestSessionId) {
    if (!mongoose.Types.ObjectId.isValid(guestSessionId)) {
      throw new BadRequestError("Invalid sessionId format", "INVALID_SESSION_ID");
    }
    session = await GameSession.findById(guestSessionId);
    if (session && session.date !== today) {
      session = null; // Guest session is from a previous day
    }
  }

  if (!session) {
    const wordDoc = await Word.findOne({ word: daily.word });
    if (!wordDoc) {
      throw new ServiceUnavailableError(
        "Daily word not found — word list may not have loaded correctly",
        "WORD_LIST_NOT_LOADED"
      );
    }

    session = await GameSession.create({
      userId: userId ?? null,
      wordId: wordDoc._id,
      date: today,
      guesses: [],
      completed: false,
      won: false,
      guessCount: null,
      completedAt: null,
    });

    logger.info(`🎮 New game session created for date ${today}`);
  }

  return buildSessionState(session, daily.word, daily.wordNumber);
}

export async function submitGuess(
  sessionId: string,
  guess: string,
  userId: string | null
): Promise<{
  result: GuessResult;
  sessionState: SessionState;
  correctWord?: string;
}> {
  if (!mongoose.Types.ObjectId.isValid(sessionId)) {
    throw new BadRequestError("Invalid sessionId format", "INVALID_SESSION_ID");
  }

  const session = await GameSession.findById(sessionId);

  if (!session) {
    throw new NotFoundError("Game session not found", "SESSION_NOT_FOUND");
  }
  if (session.completed) {
    throw new ConflictError("Game already completed", "GAME_ALREADY_COMPLETED");
  }
  if (session.guesses.length >= 6) {
    throw new ConflictError("Maximum guesses reached", "MAX_GUESSES_EXCEEDED");
  }

  if (session.userId && userId !== session.userId.toString()) {
    throw new ForbiddenError(
      "This game session belongs to a different user",
      "FORBIDDEN"
    );
  }

  const sanitized = sanitizeWord(guess);

  if (!isValidWord(sanitized)) {
    throw new BadRequestError(
      "Guess must be exactly 5 alphabetic characters",
      "INVALID_GUESS_FORMAT"
    );
  }

  const wordExists = await Word.findOne({ word: sanitized });
  if (!wordExists) {
    throw new UnprocessableEntityError(
      "Word not in dictionary",
      "WORD_NOT_IN_DICTIONARY"
    );
  }

  const daily = await getDailyWord();
  const colors = calculateColors(sanitized, daily.word);

  const isWin = sanitized === daily.word;
  const isLastGuess = session.guesses.length + 1 >= 6;
  const completed = isWin || isLastGuess;

  session.guesses.push(sanitized);
  session.completed = completed;
  session.won = isWin;
  session.guessCount = isWin ? session.guesses.length : null;
  session.completedAt = completed ? new Date() : null;

  await session.save();

  const result: GuessResult = { guess: sanitized, colors };
  const sessionState = buildSessionState(session, daily.word, daily.wordNumber);
  const correctWord = completed && !isWin ? daily.word : undefined;

  logger.info(
    `🎯 Guess submitted: ${sanitized} — ${isWin ? "WIN" : completed ? "LOSS" : "continuing"}`
  );

  return { result, sessionState, correctWord };
}

export async function updateUserStats(
  userId: string,
  won: boolean,
  guessCount: number | null,
  lastPlayedDate: string
): Promise<void> {
  const { User } = await import("../models/User.js");

  const user = await User.findById(userId);
  if (!user) return;

  const today = lastPlayedDate;
  const lastPlayed = user.stats.lastPlayedDate
    ? user.stats.lastPlayedDate.toISOString().split("T")[0]
    : null;

  const isConsecutiveDay =
    lastPlayed &&
    new Date(today).getTime() - new Date(lastPlayed).getTime() === 86400000;

  user.stats.gamesPlayed += 1;

  if (won) {
    user.stats.gamesWon += 1;
    user.stats.currentStreak = isConsecutiveDay
      ? user.stats.currentStreak + 1
      : 1;
    user.stats.maxStreak = Math.max(
      user.stats.maxStreak,
      user.stats.currentStreak
    );
    if (guessCount !== null) {
      const key = guessCount.toString() as "1" | "2" | "3" | "4" | "5" | "6";
      user.stats.guessDistribution[key] += 1;
    }
  } else {
    user.stats.currentStreak = 0;
  }

  user.stats.lastPlayedDate = new Date(today);
  await user.save();

  logger.info(`📊 Stats updated for user ${userId}`);
}
