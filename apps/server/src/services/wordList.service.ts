import { createRequire } from "module";
import { logger } from "../utils/logger.js";

const require = createRequire(import.meta.url);

const answerWords: string[] = require("../data/answerWords.json");
const validWords: string[] = require("../data/validWords.json");

const ANSWER_SET = new Set<string>(answerWords);
const VALID_SET = new Set<string>(validWords);

// Fixed epoch — June 19, 2021 (original Wordle launch date)
const EPOCH = new Date("2021-06-19").getTime();
const MS_PER_DAY = 86400000;

export function getTodayDateString(): string {
  return new Date().toISOString().split("T")[0];
}

export function getDayIndex(dateString: string): number {
  const date = new Date(dateString).getTime();
  return Math.floor((date - EPOCH) / MS_PER_DAY);
}

export function getAnswerForDate(dateString: string): string {
  const index = getDayIndex(dateString);
  return answerWords[index % answerWords.length];
}

export function isValidGuess(word: string): boolean {
  const upper = word.toUpperCase().trim();
  return VALID_SET.has(upper) || ANSWER_SET.has(upper);
}

export function getTotalAnswerWords(): number {
  return answerWords.length;
}

logger.info(`📚 Word lists loaded — ${answerWords.length} answers, ${validWords.length} valid guesses`);
