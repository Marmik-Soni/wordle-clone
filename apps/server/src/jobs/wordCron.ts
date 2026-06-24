import cron from "node-cron";
import { checkAndRefillWords } from "../services/wordPipeline.service.js";
import { clearDailyWordCache } from "../services/dailyWord.service.js";
import { logger } from "../utils/logger.js";

export function startCronJobs(): void {
  // Midnight IST = 18:30 UTC
  cron.schedule("30 18 * * *", async () => {
    logger.info("Cron: midnight IST — clearing daily word cache");
    clearDailyWordCache();
  });

  // Every 6 hours — check word supply
  cron.schedule("0 */6 * * *", async () => {
    logger.info("Cron: checking word supply");
    try {
      await checkAndRefillWords();
    } catch (error) {
      logger.error("Cron: word refill failed", { error });
    }
  });

  logger.info("Cron jobs started");
}
