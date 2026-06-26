import { getAnswerForDate, getTodayDateString, getDayIndex } from "./wordList.service.js";
import { logger } from "../utils/logger.js";

export interface DailyWordCache {
  word: string;
  date: string;
  wordNumber: number;
}

let cache: DailyWordCache | null = null;

export function getDailyWord(): DailyWordCache {
  const today = getTodayDateString();

  if (cache && cache.date === today) {
    return cache;
  }

  const word = getAnswerForDate(today);
  const wordNumber = getDayIndex(today) + 1;

  cache = { word, date: today, wordNumber };

  logger.info(`📅 Daily word for ${today}: [HIDDEN] (puzzle #${wordNumber})`);

  return cache;
}

export function clearDailyWordCache(): void {
  cache = null;
  logger.info("🔄 Daily word cache cleared");
}
