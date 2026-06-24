import { env } from "../config/env.js";
import { Word } from "../models/Word.js";
import { logger } from "../utils/logger.js";
import { isValidWord, sanitizeWord } from "../utils/wordValidator.js";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

async function fetchWordsFromAI(count: number): Promise<string[]> {
  const prompt = `List exactly ${count} unique 5-letter English words for a Wordle game.
Rules:
- Exactly 5 letters each
- Common words only (nouns, verbs, adjectives most people know)
- No proper nouns, abbreviations, or slang
- No offensive words
- No repeats
Return one word per line, uppercase, nothing else. No numbering, no JSON, no punctuation.
Example:
CRANE
AUDIO
PLANT
STONE`;

  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/Marmik-Soni/wordle-clone",
      "X-Title": "Wordle Clone",
    },
    body: JSON.stringify({
      model: "openrouter/auto",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.8,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} — ${error}`);
  }

  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>;
  };

  const content = data.choices[0]?.message?.content;
  if (!content) throw new Error("Empty response from AI");

  // Parse one-word-per-line format — no JSON, no truncation issues
  const words = content
    .split("\n")
    .map((line) => line.trim().toUpperCase())
    .filter((line) => /^[A-Z]{5}$/.test(line));

  return words;
}

async function fetchWordsInBatches(totalCount: number, batchSize: number = 50): Promise<string[]> {
  const batches = Math.ceil(totalCount / batchSize);
  const allWords: string[] = [];

  logger.info(`Fetching ${totalCount} words in ${batches} batches of ${batchSize}`);

  for (let i = 0; i < batches; i++) {
    logger.info(`Fetching batch ${i + 1}/${batches}`);
    try {
      const words = await fetchWordsFromAI(batchSize);
      allWords.push(...words);
      // Small delay between batches to avoid rate limiting
      if (i < batches - 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    } catch (error) {
      logger.warn(`Batch ${i + 1} failed — continuing with remaining batches`, { error });
    }
  }

  return allWords;
}

export async function runWordPipeline(requestedCount: number): Promise<{
  fetched: number;
  validated: number;
  stored: number;
  duplicates: number;
}> {
  logger.info(`Word pipeline started — requesting ${requestedCount} words from AI`);

  let rawWords: string[] = [];

  try {
    rawWords = await fetchWordsInBatches(requestedCount, 50);
  } catch (error) {
    logger.error("Failed to fetch words from AI", { error });
    throw error;
  }

  logger.info(`AI returned ${rawWords.length} raw words`);

  const validWords = rawWords
    .map(sanitizeWord)
    .filter(isValidWord);

  logger.info(`${validWords.length} words passed validation`);

  let stored = 0;
  let duplicates = 0;

  for (const word of validWords) {
    try {
      await Word.create({ word, source: "ai" });
      stored++;
    } catch (error: unknown) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code: number }).code === 11000
      ) {
        duplicates++;
      } else {
        logger.warn(`Failed to store word "${word}"`, { error });
      }
    }
  }

  logger.info(`Pipeline complete — stored: ${stored}, duplicates skipped: ${duplicates}`);

  return { fetched: rawWords.length, validated: validWords.length, stored, duplicates };
}

export async function getUnusedWordCount(): Promise<number> {
  return Word.countDocuments({ used: false });
}

export async function checkAndRefillWords(): Promise<void> {
  const count = await getUnusedWordCount();
  const threshold = parseInt(env.WORD_REFILL_THRESHOLD, 10);
  const fetchCount = parseInt(env.WORD_FETCH_COUNT, 10);

  logger.info(`Unused word count: ${count} (threshold: ${threshold})`);

  if (count < threshold) {
    logger.info("Below threshold — triggering word pipeline refill");
    await runWordPipeline(fetchCount);
  }
}
