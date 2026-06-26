import { env } from "../config/env.js";
import { Word } from "../models/Word.js";
import { logger } from "../utils/logger.js";
import { isValidWord, sanitizeWord } from "../utils/wordValidator.js";

const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent`;

async function fetchWordsFromAI(count: number): Promise<string[]> {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const randomLetters = Array.from(
    { length: 6 },
    () => alphabet[Math.floor(Math.random() * alphabet.length)]
  ).join(", ");

  const prompt = `List exactly ${count} unique 5-letter English words for a Wordle game.

Rules:
- Exactly 5 letters each
- Common everyday English words only
- CRITICAL: Distribute evenly across ALL letters A through Z — approximately 25 words per starting letter
- Do NOT list words alphabetically — mix them up randomly
- No proper nouns, no abbreviations, no slang
- No offensive words
- No repeated words

Return one word per line, uppercase, nothing else. No numbering, no JSON, no punctuation.`;

  logger.info(`🎲 Random letter seed for this fetch: ${randomLetters}`);

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
          temperature: 0.95,
          maxOutputTokens: 4096,
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

  const words = content
    .split("\n")
    .map((line) => line.trim().toUpperCase())
    .filter((line) => /^[A-Z]{5}$/.test(line));

  return words;
}

export async function runWordPipeline(requestedCount: number): Promise<{
  fetched: number;
  validated: number;
  stored: number;
  duplicates: number;
}> {
  logger.info(`🚀 Word pipeline started — single API call for ${requestedCount} words`);

  let rawWords: string[] = [];

  try {
    rawWords = await fetchWordsFromAI(requestedCount);
  } catch (error) {
    logger.error("❌ Failed to fetch words from AI", {
      error: error instanceof Error ? error.message : String(error)
    });
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

  if (efficiency < 30) {
    logger.warn(`⚠️  Pipeline efficiency low (${efficiency}%) — word pool may be exhausting`);
  }

  return { fetched: rawWords.length, validated: validWords.length, stored, duplicates };
}

export async function getUnusedWordCount(): Promise<number> {
  return Word.countDocuments({ used: false });
}

export async function checkAndRefillWords(): Promise<void> {
  const count = await getUnusedWordCount();
  const threshold = parseInt(process.env.WORD_REFILL_THRESHOLD || "30", 10);
  const fetchCount = parseInt(process.env.WORD_FETCH_COUNT || "500", 10);

  logger.info(`📊 Unused word count: ${count} (threshold: ${threshold})`);

  if (count < threshold) {
    const existingTotal = await Word.countDocuments({});
    const TOTAL_POSSIBLE_WORDS = 5000;
    const overlapRate = Math.min(existingTotal / TOTAL_POSSIBLE_WORDS, 0.8);
    const requestCount = Math.ceil(fetchCount / (1 - overlapRate));

    logger.info(
      `🔁 Below threshold — overlap rate: ${Math.round(overlapRate * 100)}%, requesting ${requestCount} words`
    );

    await runWordPipeline(requestCount);
  }
}
