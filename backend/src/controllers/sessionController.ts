import { Response } from "express";
import { prisma } from "../utils/prisma";
import { AuthRequest } from "../middleware/authMiddleware";

export const getActiveSessions = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const sessions = await prisma.userSession.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: {
        lastActiveAt: "desc",
      },
      select: {
        id: true,
        ipAddress: true,
        browserName: true,
        browserVersion: true,
        operatingSystem: true,
        deviceType: true,
        deviceModel: true,
        createdAt: true,
        lastActiveAt: true,
        expiresAt: true,
      },
    });

    return res.status(200).json({
      success: true,
      count: sessions.length,
      sessions,
    });
  } catch (error) {
    console.error("Get active sessions error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve active sessions",
    });
  }
};

export const getSessionDetails = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const userId = req.user?.userId;
    const currentSessionId = req.user?.sessionId;
    const sessionId = Number(req.params.id);

    if (!userId || !currentSessionId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    if (!Number.isInteger(sessionId) || sessionId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid session ID",
      });
    }

    const session = await prisma.userSession.findFirst({
      where: {
        id: sessionId,
        userId,
      },
      select: {
        id: true,
        ipAddress: true,
        browserName: true,
        browserVersion: true,
        operatingSystem: true,
        deviceType: true,
        deviceModel: true,
        createdAt: true,
        lastActiveAt: true,
        expiresAt: true,
        revokedAt: true,
      },
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Session not found",
      });
    }

    return res.status(200).json({
      success: true,
      session: {
        ...session,
        isCurrentSession: session.id === currentSessionId,
      },
    });
  } catch (error) {
    console.error("Get session details error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve session details",
    });
  }
};

export const revokeSession = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const userId = req.user?.userId;
    const sessionId = Number(req.params.id);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    if (!Number.isInteger(sessionId) || sessionId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid session ID",
      });
    }

    const session = await prisma.userSession.findFirst({
      where: {
        id: sessionId,
        userId,
        revokedAt: null,
      },
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Session not found or already revoked",
      });
    }

    await prisma.userSession.update({
      where: {
        id: session.id,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    return res.status(200).json({
      success: true,
      message: "Session revoked successfully",
      sessionId: session.id,
    });
  } catch (error) {
    console.error("Revoke session error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to revoke session",
    });
  }
};

export const revokeOtherSessions = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const userId = req.user?.userId;
    const currentSessionId = req.user?.sessionId;

    if (!userId || !currentSessionId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const result = await prisma.userSession.updateMany({
      where: {
        userId,
        id: {
          not: currentSessionId,
        },
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      data: {
        revokedAt: new Date(),
      },
    });

    return res.status(200).json({
      success: true,
      message: "All other sessions revoked successfully",
      revokedCount: result.count,
      currentSessionId,
    });
  } catch (error) {
    console.error("Revoke other sessions error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to revoke other sessions",
    });
  }
};