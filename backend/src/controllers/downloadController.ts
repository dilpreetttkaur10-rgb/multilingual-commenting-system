import { Response } from "express";
import { prisma } from "../utils/prisma";
import { AuthRequest } from "../middleware/authMiddleware";

// ==========================================
// CREATE DOWNLOAD
// ==========================================

export const createDownload = async (
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

    const {
      videoUrl,
      videoTitle,
      fileName,
      fileSizeMB,
    } = req.body;

    if (!videoUrl) {
      return res.status(400).json({
        success: false,
        message: "Video URL is required",
      });
    }

    // ==========================================
    // FIND ACTIVE SUBSCRIPTION
    // ==========================================

    const subscription =
      await prisma.userSubscription.findFirst({
        where: {
          userId,
          isActive: true,
        },
        include: {
          plan: true,
        },
        orderBy: {
          endDate: "desc",
        },
      });

    if (!subscription) {
      return res.status(403).json({
        success: false,
        message: "No active subscription found",
      });
    }

    // ==========================================
    // CHECK SUBSCRIPTION EXPIRY
    // ==========================================

    const now = new Date();

    if (subscription.endDate <= now) {
      await prisma.userSubscription.update({
        where: {
          id: subscription.id,
        },
        data: {
          isActive: false,
        },
      });

      return res.status(403).json({
        success: false,
        message: "Subscription has expired",
      });
    }

    // ==========================================
    // CHECK DOWNLOAD LIMIT
    // ==========================================

    if (
      subscription.downloadsUsed >=
      subscription.plan.downloadLimit
    ) {
      return res.status(403).json({
        success: false,
        message: "Download limit reached",
        downloadsLimit:
          subscription.plan.downloadLimit,
        downloadsUsed:
          subscription.downloadsUsed,
      });
    }

    // ==========================================
    // CHECK FILE SIZE
    // ==========================================

    if (
      fileSizeMB !== undefined &&
      fileSizeMB !== null
    ) {
      if (
        typeof fileSizeMB !== "number" ||
        fileSizeMB <= 0
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid file size",
        });
      }

      if (
        fileSizeMB >
        subscription.plan.maxFileSizeMB
      ) {
        return res.status(403).json({
          success: false,
          message:
            "File size exceeds your subscription limit",
          maxFileSizeMB:
            subscription.plan.maxFileSizeMB,
          requestedFileSizeMB: fileSizeMB,
        });
      }
    }

    // ==========================================
    // CREATE DOWNLOAD
    // ==========================================

    const download = await prisma.download.create({
      data: {
        userId,
        videoUrl,
        videoTitle,
        fileName,
        fileSizeMB,
        status: "PENDING",
      },
    });

    // ==========================================
    // INCREMENT DOWNLOAD COUNT
    // ==========================================

    await prisma.userSubscription.update({
      where: {
        id: subscription.id,
      },
      data: {
        downloadsUsed: {
          increment: 1,
        },
      },
    });

    return res.status(201).json({
      success: true,
      message: "Download request created successfully",
      download,
      subscription: {
        plan: subscription.plan.name,
        downloadsLimit:
          subscription.plan.downloadLimit,
        downloadsUsed:
          subscription.downloadsUsed + 1,
        downloadsRemaining:
          subscription.plan.downloadLimit -
          (subscription.downloadsUsed + 1),
        maxFileSizeMB:
          subscription.plan.maxFileSizeMB,
      },
    });
  } catch (error) {
    console.error("Create download error:", error);

    return res.status(500).json({
      success: false,
      message: "Something went wrong",
    });
  }
};

// ==========================================
// GET DOWNLOAD HISTORY
// ==========================================

export const getDownloadHistory = async (
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

    const downloads = await prisma.download.findMany({
      where: {
        userId,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return res.status(200).json({
      success: true,
      message:
        "Download history retrieved successfully",
      count: downloads.length,
      downloads,
    });
  } catch (error) {
    console.error(
      "Get download history error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Something went wrong",
    });
  }
};

// ==========================================
// UPDATE DOWNLOAD STATUS
// ==========================================

export const updateDownloadStatus = async (
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

    const downloadId = Number(req.params.id);

    if (!Number.isInteger(downloadId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid download ID",
      });
    }

    const { status } = req.body;

    const allowedStatuses = [
      "PENDING",
      "DOWNLOADING",
      "COMPLETED",
      "FAILED",
      "CANCELLED",
    ];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid download status",
        allowedStatuses,
      });
    }

    const existingDownload =
      await prisma.download.findFirst({
        where: {
          id: downloadId,
          userId,
        },
      });

    if (!existingDownload) {
      return res.status(404).json({
        success: false,
        message: "Download not found",
      });
    }

    const updateData: {
      status:
        | "PENDING"
        | "DOWNLOADING"
        | "COMPLETED"
        | "FAILED"
        | "CANCELLED";
      startedAt?: Date;
      completedAt?: Date;
    } = {
      status,
    };

    if (
      status === "DOWNLOADING" &&
      !existingDownload.startedAt
    ) {
      updateData.startedAt = new Date();
    }

    if (status === "COMPLETED") {
      if (!existingDownload.startedAt) {
        updateData.startedAt = new Date();
      }

      updateData.completedAt = new Date();
    }

    const download = await prisma.download.update({
      where: {
        id: downloadId,
      },
      data: updateData,
    });

    return res.status(200).json({
      success: true,
      message:
        "Download status updated successfully",
      download,
    });
  } catch (error) {
    console.error(
      "Update download status error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Something went wrong",
    });
  }
};