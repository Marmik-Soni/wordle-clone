import cron from "node-cron";
import { clearDailyWordCache } from "../services/dailyWord.service.js";
import { logger } from "../utils/logger.js";

export function startCronJobs(): void {
  // Every day at midnight IST (18:30 UTC) — clear cache so new word is picked
  cron.schedule("30 18 * * *", () => {
    logger.info("⏰ Cron: midnight IST — clearing daily word cache");
    clearDailyWordCache();
  });

  logger.info("⏰ Cron jobs started");
}
