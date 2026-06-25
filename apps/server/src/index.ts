import express from "express";
import cors from "cors";
import { connectDB } from "./config/db.js";
import { env } from "./config/env.js";
import { logger } from "./utils/logger.js";
import { startCronJobs } from "./jobs/wordCron.js";
import { checkAndRefillWords } from "./services/wordPipeline.service.js";
import wordsRouter from "./routes/words.routes.js";
import authRouter from "./routes/auth.routes.js";
import userRouter from "./routes/user.routes.js";
import { errorHandler } from "./middleware/errorHandler.js";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", env: env.NODE_ENV });
});

app.use("/api/auth", authRouter);
app.use("/api/user", userRouter);
app.use("/api/words", wordsRouter);

app.use(errorHandler);

async function bootstrap() {
  await connectDB();

  try {
    await checkAndRefillWords();
  } catch (error) {
    logger.error("Word pipeline failed on startup — server will continue", { error });
  }

  startCronJobs();

  app.listen(env.PORT, () => {
    logger.info(`🚀 Server running on port ${env.PORT} in ${env.NODE_ENV} mode`);
  });
}

bootstrap();
