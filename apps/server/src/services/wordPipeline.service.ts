import { env } from "../config/env.js";
import { Word } from "../models/Word.js";
import { logger } from "../utils/logger.js";
import { isValidWord, sanitizeWord } from "../utils/wordValidator.js";

const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent`;

async function fetchWordsFromAI(count: number): Promise<string[]> {
  const prompt = `List exactly ${count} unique 5-letter English words for a Wordle game.
Rules:
- Exactly 5 letters each
- Common everyday English words only (nouns, verbs, adjectives most people know)
- Natural mix of starting letters — do NOT cluster around any particular letter
- Prioritize words starting with common letters: S, T, R, C, B, P, M, F, H, W, G, D
- No proper nouns, no abbreviations, no slang
- No offensive or inappropriate words
- No repeated words
Return one word per line, uppercase, nothing else. No numbering, no JSON, no punctuation.
Example:
CRANE
AUDIO
PLANT
STONE`;

  const response = await fetch(
    `${GEMINI_API_URL}?key=${env.GOOGLE_AI_API_KEY}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.9,
          maxOutputTokens: 2048,
        },
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${response.status} — ${error}`);
  }

  const data = await response.json() as {
    candidates: Array<{
      content: {
        parts: Array<{ text: string }>;
      };
    }>;
  };

  const content = data.candidates[0]?.content?.parts[0]?.text;
  if (!content) throw new Error("Empty response from Gemini");

  // Parse one word per line — resilient to any extra formatting
  const words = content
    .split("\n")
    .map((line) => line.trim().toUpperCase())
    .filter((line) => /^[A-Z]{5}$/.test(line));

  return words;
}

async function fetchWordsInBatches(
  totalCount: number,
  batchSize: number
): Promise<string[]> {
  const batches = Math.ceil(totalCount / batchSize);
  const allWords: string[] = [];
  let totalFetched = 0;

  logger.info(`📦 Fetching ${totalCount} words in ${batches} batches of ${batchSize}`);

  for (let i = 0; i < batches; i++) {
    logger.info(
      `🔄 Batch ${i + 1}/${batches} — fetching ${batchSize} words (${totalFetched}/${totalCount} fetched so far)`
    );
    try {
      const words = await fetchWordsFromAI(batchSize);
      allWords.push(...words);
      totalFetched += words.length;
      logger.info(
        `✅ Batch ${i + 1}/${batches} complete — got ${words.length} words (${totalFetched} total so far)`
      );

      if (totalFetched >= totalCount) {
        logger.info(`🎯 Reached target of ${totalCount} words — stopping batches early`);
        break;
      }

      // Delay between batches to respect rate limits
      if (i < batches - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } catch (error) {
      logger.warn(`⚠️  Batch ${i + 1}/${batches} failed — continuing`, { error });
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
  logger.info(`🚀 Word pipeline started — requesting ${requestedCount} words from AI`);

  const batchSize = parseInt(env.WORD_BATCH_SIZE, 10);
  let rawWords: string[] = [];

  try {
    rawWords = await fetchWordsInBatches(requestedCount, batchSize);
  } catch (error) {
    logger.error("❌ Failed to fetch words from AI", { error });
    throw error;
  }

  logger.info(`📥 AI returned ${rawWords.length} raw words`);

  const validWords = rawWords.map(sanitizeWord).filter(isValidWord);

  logger.info(`✅ ${validWords.length} words passed validation`);

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
        logger.warn(`⚠️  Failed to store word "${word}"`, { error });
      }
    }
  }

  const efficiency = Math.round((stored / rawWords.length) * 100);

  logger.info(`🎉 Pipeline complete — stored: ${stored}, duplicates skipped: ${duplicates}`);
  logger.info(`📈 Pipeline efficiency: ${efficiency}%`);

  if (efficiency < 20) {
    logger.warn(`⚠️  Pipeline efficiency critically low (${efficiency}%) — word pool may be exhausting`);
  }

  return { fetched: rawWords.length, validated: validWords.length, stored, duplicates };
}

export async function getUnusedWordCount(): Promise<number> {
  return Word.countDocuments({ used: false });
}

export async function checkAndRefillWords(): Promise<void> {
  const count = await getUnusedWordCount();
  const threshold = parseInt(env.WORD_REFILL_THRESHOLD, 10);
  const fetchCount = parseInt(env.WORD_FETCH_COUNT, 10);

  logger.info(`📊 Unused word count: ${count} (threshold: ${threshold})`);

  if (count < threshold) {
    const existingTotal = await Word.countDocuments({});
    const TOTAL_POSSIBLE_WORDS = 5000;
    const overlapRate = Math.min(existingTotal / TOTAL_POSSIBLE_WORDS, 0.8);
    const requestCount = Math.ceil(fetchCount / (1 - overlapRate));

    logger.info(
      `🔁 Below threshold — overlap rate: ${Math.round(overlapRate * 100)}%, requesting ${requestCount} words to get ~${fetchCount} net new`
    );

    await runWordPipeline(requestCount);
  }
}
