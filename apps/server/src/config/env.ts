import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default("5000"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 characters"),
  JWT_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),
  GOOGLE_AI_API_KEY: z.string().optional(),
  WORD_REFILL_THRESHOLD: z.string().default("30"),
  WORD_FETCH_COUNT: z.string().default("500"),
  DOCS_USER: z.string().default("admin"),
  DOCS_PASSWORD: z.string().default("wordle_docs_2024"),
  // Comma-separated list of allowed CORS origins. Defaults to localhost in dev.
  ALLOWED_ORIGINS: z.string().optional(),
  // Secret key required in x-admin-key header to access admin-only endpoints.
  ADMIN_API_KEY: z.string().min(32, "ADMIN_API_KEY must be at least 32 characters"),
  // Public-facing API base URL — used in Swagger docs for the production server entry.
  // Example: https://api.yourdomain.com
  API_URL: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
