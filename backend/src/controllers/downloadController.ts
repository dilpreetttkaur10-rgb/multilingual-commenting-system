
import { Response } from "express";
import { prisma } from "../utils/prisma";
import { AuthRequest } from "../middleware/authMiddleware";

// ==========================================
// QUOTA PERIOD — INDIA STANDARD TIME
// ==========================================

const getQuotaPeriod = (now: Date, isFree: boolean) => {
  const istNow = new Date(now.getTime() + 330 * 60 * 1000);

  const year = istNow.getUTCFullYear();
  const month = istNow.getUTCMonth();
  const day = istNow.getUTCDate();

  const start = isFree
    ? new Date(Date.UTC(year, month, day) - 330 * 60 * 1000)
    : new Date(Date.UTC(year, month, 1) - 330 * 60 * 1000);

  const end = isFree
    ? new Date(start.getTime() + 24 * 60 * 60 * 1000)
    : new Date(Date.UTC(year, month + 1, 1) - 330 * 60 * 1000);

  return { start, end };
};

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

    if (
      typeof videoUrl !== "string" ||
      !videoUrl.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Video URL is required",
      });
    }

    if (
      fileSizeMB !== undefined &&
      fileSizeMB !== null &&
      (!Number.isInteger(fileSizeMB) || fileSizeMB <= 0)
    ) {
      return res.status(400).json({
        success: false,
        message: "File size must be a positive integer",
      });
    }

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

    if (
      fileSizeMB !== undefined &&
      fileSizeMB !== null &&
      fileSizeMB > subscription.plan.maxFileSizeMB
    ) {
      return res.status(403).json({
        success: false,
        message: "File size exceeds your subscription limit",
        maxFileSizeMB: subscription.plan.maxFileSizeMB,
        requestedFileSizeMB: fileSizeMB,
      });
    }

    const isFree =
      subscription.plan.name.toUpperCase() === "FREE";

    const downloadLimit = isFree
      ? 1
      : subscription.plan.downloadLimit;

    const period = getQuotaPeriod(now, isFree);

    // ==========================================
    // ATOMIC QUOTA CHECK + DOWNLOAD CREATION
    // ==========================================

    let result:
      | { limited: true; used: number }
      | { limited: false; download: any; used: number }
      | undefined;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        result = await prisma.$transaction(
          async (tx) => {
            const downloadsUsed =
              await tx.download.count({
                where: {
                  userId,
                  createdAt: {
                    gte: period.start,
                    lt: period.end,
                  },
                },
              });

            if (downloadsUsed >= downloadLimit) {
              return {
                limited: true as const,
                used: downloadsUsed,
              };
            }

            const download =
              await tx.download.create({
                data: {
                  userId,
                  videoUrl: videoUrl.trim(),
                  videoTitle,
                  fileName,
                  fileSizeMB,
                  status: "PENDING",
                },
              });

            await tx.userSubscription.update({
              where: {
                id: subscription.id,
              },
              data: {
                downloadsUsed: {
                  increment: 1,
                },
              },
            });

            return {
              limited: false as const,
              download,
              used: downloadsUsed + 1,
            };
          },
          {
            isolationLevel: "Serializable",
          }
        );

        break;
      } catch (error) {
        const prismaError = error as { code?: string };

        if (
          prismaError.code === "P2034" &&
          attempt < 2
        ) {
          continue;
        }

        throw error;
      }
    }

    if (!result) {
      return res.status(500).json({
        success: false,
        message: "Could not process download request",
      });
    }

    if (result.limited) {
      return res.status(403).json({
        success: false,
        message: isFree
          ? "Daily download limit reached"
          : "Monthly download limit reached",
        plan: subscription.plan.name,
        downloadsLimit: downloadLimit,
        downloadsUsed: result.used,
        downloadsRemaining: 0,
        resetAt: period.end,
      });
    }

    return res.status(201).json({
      success: true,
      message: "Download request created successfully",
      download: result.download,
      subscription: {
        plan: subscription.plan.name,
        downloadsLimit: downloadLimit,
        downloadsUsed: result.used,
        downloadsRemaining:
          downloadLimit - result.used,
        maxFileSizeMB: subscription.plan.maxFileSizeMB,
        resetAt: period.end,
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
      message: "Download history retrieved successfully",
      count: downloads.length,
      downloads,
    });
  } catch (error) {
    console.error("Get download history error:", error);

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

    if (!Number.isInteger(downloadId) || downloadId <= 0) {
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
    ] as const;

    if (
      typeof status !== "string" ||
      !allowedStatuses.includes(
        status as (typeof allowedStatuses)[number]
      )
    ) {
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
      status: (typeof allowedStatuses)[number];
      startedAt?: Date;
      completedAt?: Date;
    } = {
      status: status as (typeof allowedStatuses)[number],
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
      message: "Download status updated successfully",
      download,
    });
  } catch (error) {
    console.error("Update download status error:", error);

    return res.status(500).json({
      success: false,
      message: "Something went wrong",
    });
  }
};
