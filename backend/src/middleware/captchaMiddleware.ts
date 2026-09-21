import { Request, Response, NextFunction } from "express";
import { verifyTurnstileToken } from "../services/turnstileService";

interface AuthRequest extends Request {
  user?: {
    userId: number;
    email: string;
  };
}

interface AttemptData {
  count: number;
  firstAttempt: number;
}

const attempts = new Map<string, AttemptData>();

const WINDOW_MS = 60 * 1000;

// CAPTCHA starts after 3 attempts
const CAPTCHA_AFTER = 3;

export const captchaAttemptMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const key = `user:${req.user.userId}`;

    const now = Date.now();

    let data = attempts.get(key);

    // Start a new one-minute window
    if (!data || now - data.firstAttempt >= WINDOW_MS) {
      data = {
        count: 0,
        firstAttempt: now,
      };

      attempts.set(key, data);
    }

    // CAPTCHA required after repeated attempts
    if (data.count >= CAPTCHA_AFTER) {
      const turnstileToken = req.body?.turnstileToken;

      if (!turnstileToken) {
        return res.status(428).json({
          success: false,
          captchaRequired: true,
          message:
            "CAPTCHA verification is required after repeated posting attempts",
        });
      }

      const captchaValid = await verifyTurnstileToken(
        turnstileToken,
        req.ip
      );

      if (!captchaValid) {
        return res.status(400).json({
          success: false,
          captchaRequired: true,
          message: "CAPTCHA verification failed",
        });
      }

      // CAPTCHA successfully passed
      attempts.delete(key);

      return next();
    }

    // Count this posting attempt
    data.count += 1;

    attempts.set(key, data);

    next();
  } catch (error) {
    console.error("CAPTCHA middleware error:", error);

    return res.status(500).json({
      success: false,
      message: "CAPTCHA verification error",
    });
  }
};