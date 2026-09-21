import rateLimit from "express-rate-limit";

export const commentRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute

  limit: 5, // Maximum 5 comments per minute

  standardHeaders: "draft-7",

  legacyHeaders: false,

  message: {
    success: false,
    message:
      "Too many comments posted. Please wait a minute before trying again.",
  },
});