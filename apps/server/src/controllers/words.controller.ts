import type { Request, Response } from "express";
import { runWordPipeline, getUnusedWordCount } from "../services/wordPipeline.service.js";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

export async function getWordCount(req: Request, res: Response): Promise<void> {
  try {
    const count = await getUnusedWordCount();
    res.json({ unusedWords: count });
  } catch (error) {
    logger.error("Failed to get word count", { error });
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function triggerWordFetch(req: Request, res: Response): Promise<void> {
  try {
    const count = parseInt(env.WORD_FETCH_COUNT, 10);
    const result = await runWordPipeline(count);
    res.json({ success: true, result });
  } catch (error) {
    logger.error("Failed to trigger word fetch", { error });
    res.status(500).json({ error: "Failed to fetch words" });
  }
}
