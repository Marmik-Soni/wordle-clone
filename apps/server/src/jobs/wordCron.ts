import cron from "node-cron";
import { clearDailyWordCache } from "../services/dailyWord.service.js";
// import { checkAndRefillWords } from "../services/wordPipeline.service.js";
import { logger } from "../utils/logger.js";

export function startCronJobs(): void {
  // Every day at midnight IST — clear the in-memory daily word cache so the
  // new puzzle word is picked on the next request.
  // Using the "Asia/Kolkata" timezone option instead of a hardcoded UTC offset,
  // so this is immune to any server timezone changes.
  cron.schedule(
    "0 0 * * *",
    () => {
      logger.info("⏰ Cron: midnight IST — clearing daily word cache");
      clearDailyWordCache();
    },
    { timezone: "Asia/Kolkata" }
  );

  // ── Word pipeline refill cron — DISABLED ──────────────────────────────────
  //
  // The AI word-generation pipeline is turned off. The word pool is sourced
  // entirely from the static JSON files in src/data/.
  //
  // To re-enable, uncomment the block below and restore the import above.
  //
  // cron.schedule("0 2 * * *", async () => {
  //   logger.info("⏰ Cron: checking word pool threshold");
  //   try {
  //     await checkAndRefillWords();
  //   } catch (error) {
  //     logger.error("❌ Cron: word refill failed", {
  //       error: error instanceof Error ? error.message : String(error),
  //     });
  //   }
  // });

  logger.info("⏰ Cron jobs started (daily word refresh at midnight IST)");
}
