import { User } from "../models/User.js";
import { logger } from "../utils/logger.js";

/**
 * Updates a user's game statistics after a completed game.
 * Extracted from game.service.ts to break the circular dependency
 * that previously required a dynamic import().
 */
export async function updateUserStats(
  userId: string,
  won: boolean,
  guessCount: number | null,
  lastPlayedDate: string
): Promise<void> {
  const user = await User.findById(userId);
  if (!user) return;

  const today = lastPlayedDate;
  const lastPlayed = user.stats.lastPlayedDate
    ? user.stats.lastPlayedDate.toISOString().split("T")[0]
    : null;

  // A win is a "consecutive" day if the previous play was exactly 1 day ago
  const isConsecutiveDay =
    lastPlayed &&
    new Date(today).getTime() - new Date(lastPlayed).getTime() === 86_400_000;

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
