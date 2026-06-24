import { Word } from "../models/Word.js";
import { logger } from "../utils/logger.js";

interface DailyWordCache {
  word: string;
  wordId: string;
  date: string;
  wordNumber: number;
}

let cache: DailyWordCache | null = null;

function getTodayDateString(): string {
  return new Date().toISOString().split("T")[0];
}

export async function getDailyWord(): Promise<DailyWordCache> {
  const today = getTodayDateString();

  if (cache && cache.date === today) {
    return cache;
  }

  const existing = await Word.findOne({ usedOn: today, used: true });

  if (existing) {
    const wordNumber = await Word.countDocuments({ used: true });
    cache = {
      word: existing.word,
      wordId: existing._id.toString(),
      date: today,
      wordNumber,
    };
    logger.info(`Daily word loaded from DB for ${today}`);
    return cache;
  }

  const count = await Word.countDocuments({ used: false });
  const randomSkip = Math.floor(Math.random() * count);

  const nextWord = await Word.findOneAndUpdate(
    { used: false },
    { used: true, usedOn: today },
    { new: true, skip: randomSkip }
  );

  if (!nextWord) {
    throw new Error("No unused words available — pipeline refill needed");
  }

  const wordNumber = await Word.countDocuments({ used: true });

  cache = {
    word: nextWord.word,
    wordId: nextWord._id.toString(),
    date: today,
    wordNumber,
  };

  logger.info(`New daily word selected for ${today}: ${nextWord.word}`);
  return cache;
}

export function clearDailyWordCache(): void {
  cache = null;
}
