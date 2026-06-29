import express from "express";
import cors from "cors";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import { connectDB } from "./config/db.js";
import { env } from "./config/env.js";
import { logger } from "./utils/logger.js";
import { startCronJobs } from "./jobs/wordCron.js";
import { logWordListStats } from "./services/wordList.service.js";
import wordsRouter from "./routes/words.routes.js";
import authRouter from "./routes/auth.routes.js";
import userRouter from "./routes/user.routes.js";
import gameRouter from "./routes/game.routes.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { swaggerAuth } from "./middleware/swaggerAuth.js";
import { swaggerSpec } from "./config/swagger.js";
import { notFoundHandler } from "./middleware/notFound.js";

const app = express();

// Security headers — must be first
app.use(helmet());

// CORS — restrict to configured origins
const allowedOrigins = env.ALLOWED_ORIGINS
  ? env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : ["http://localhost:5173", "http://localhost:3000"];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow server-to-server requests (no Origin header) and allowed origins
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin '${origin}' not allowed`));
      }
    },
    credentials: true,
  })
);

app.use(express.json({ limit: "10kb" }));

// Health check — no internal info exposed
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
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

  // Log word list stats explicitly (removes module-level side effect)
  logWordListStats();

  startCronJobs();

  app.listen(env.PORT, () => {
    logger.info(`🚀 Server running on port ${env.PORT} in ${env.NODE_ENV} mode`);
    logger.info(`📚 API docs available at http://localhost:${env.PORT}/api-docs`);
  });
}

bootstrap();
