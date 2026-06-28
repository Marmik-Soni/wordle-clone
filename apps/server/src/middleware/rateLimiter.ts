import rateLimit from "express-rate-limit";

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: {
        message: "Too many attempts — please try again in 15 minutes",
        code: "TOO_MANY_REQUESTS",
      },
    });
  },
});
