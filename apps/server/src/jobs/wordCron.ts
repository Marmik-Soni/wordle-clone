import cron from "node-cron";
import { clearDailyWordCache } from "../services/dailyWord.service.js";
import { checkAndRefillWords } from "../services/wordPipeline.service.js";
import { logger } from "../utils/logger.js";

export function startCronJobs(): void {
  // Every day at midnight IST (18:30 UTC) — clear cache so new word is picked
  cron.schedule("30 18 * * *", () => {
    logger.info("⏰ Cron: midnight IST — clearing daily word cache");
    clearDailyWordCache();
  });

  // Every day at 2 AM UTC — check and refill the word pool if below threshold
  cron.schedule("0 2 * * *", async () => {
    logger.info("⏰ Cron: checking word pool threshold");
    try {
      await checkAndRefillWords();
    } catch (error) {
      logger.error("❌ Cron: word refill failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  logger.info("⏰ Cron jobs started (daily word refresh at 18:30 UTC, word refill at 02:00 UTC)");
}
