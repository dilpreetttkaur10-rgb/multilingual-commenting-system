import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { prisma } from "../utils/prisma";

export interface AuthRequest extends Request {
  user?: {
    userId: number;
    email: string;
    sessionId: number;
  };
}

export const authMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Authentication token required",
      });
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Authentication token required",
      });
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET!
    ) as {
      userId: number;
      email: string;
    };

    const sessionTokenHash = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const session = await prisma.userSession.findUnique({
      where: {
        sessionTokenHash,
      },
    });

    if (!session) {
      return res.status(401).json({
        success: false,
        message: "Session not found",
      });
    }

    if (session.revokedAt) {
      return res.status(401).json({
        success: false,
        message: "Session has been revoked",
      });
    }

    if (session.expiresAt < new Date()) {
      return res.status(401).json({
        success: false,
        message: "Session has expired",
      });
    }

    await prisma.userSession.update({
      where: {
        id: session.id,
      },
      data: {
        lastActiveAt: new Date(),
      },
    });

    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      sessionId: session.id,
    };

    next();
  } catch (error) {
    console.error("Authentication error:", error);

    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
};