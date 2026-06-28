import type { Request, Response } from "express";
import { runWordPipeline, getUnusedWordCount } from "../services/wordPipeline.service.js";
import { env } from "../config/env.js";
import { ServiceUnavailableError, BadGatewayError } from "../utils/errors.js";

export async function getWordCount(req: Request, res: Response): Promise<void> {
  const count = await getUnusedWordCount();
  res.json({ unusedWords: count });
}

export async function triggerWordFetch(req: Request, res: Response): Promise<void> {
  if (!env.GOOGLE_AI_API_KEY) {
    throw new ServiceUnavailableError(
      "Word pipeline is disabled — GOOGLE_AI_API_KEY is not configured",
      "PIPELINE_DISABLED"
    );
  }

  try {
    const count = parseInt(env.WORD_FETCH_COUNT, 10);
    const result = await runWordPipeline(count);
    res.json({ success: true, result });
  } catch (error) {
    throw new BadGatewayError("AI word provider failed to respond", "AI_PROVIDER_ERROR");
  }
}
