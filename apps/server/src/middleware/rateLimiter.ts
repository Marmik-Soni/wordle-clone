import rateLimit from "express-rate-limit";

/**
 * Auth rate limiter — protects register and login from brute-force attacks.
 * 10 attempts per 15 minutes per IP.
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      error: {
        message: "Too many attempts — please try again in 15 minutes",
        code: "TOO_MANY_REQUESTS",
      },
    });
  },
});

/**
 * Guess rate limiter — prevents bots from submitting thousands of guesses.
 * 30 guesses per 10 minutes per IP.
 */
export const guessRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      error: {
        message: "Too many guesses — please slow down",
        code: "TOO_MANY_REQUESTS",
      },
    });
  },
});
