import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import { connectDB } from "./config/db.js";
import { env } from "./config/env.js";
import { logger } from "./utils/logger.js";
import { startCronJobs } from "./jobs/wordCron.js";
import wordsRouter from "./routes/words.routes.js";
import authRouter from "./routes/auth.routes.js";
import userRouter from "./routes/user.routes.js";
import gameRouter from "./routes/game.routes.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { swaggerAuth } from "./middleware/swaggerAuth.js";
import { swaggerSpec } from "./config/swagger.js";
import { notFoundHandler } from "./middleware/notFound.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: "10kb" }));

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", env: env.NODE_ENV });
});

// Swagger docs — password protected
app.use(
  "/api-docs",
  swaggerAuth,
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customSiteTitle: "Wordle Clone API Docs",
  })
);

// API routes
app.use("/api/auth", authRouter);
app.use("/api/user", userRouter);
app.use("/api/game", gameRouter);
app.use("/api/words", wordsRouter);

// Error handler — must be last
app.use(notFoundHandler);
app.use(errorHandler);

async function bootstrap() {
  await connectDB();

  startCronJobs();

  app.listen(env.PORT, () => {
    logger.info(`🚀 Server running on port ${env.PORT} in ${env.NODE_ENV} mode`);
    logger.info(`📚 API docs available at http://localhost:${env.PORT}/api-docs`);
  });
}

bootstrap();
