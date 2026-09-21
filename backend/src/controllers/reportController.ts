import { Request, Response } from "express";
import { ReportStatus } from "@prisma/client";
import { prisma } from "../utils/prisma";

interface AuthRequest extends Request {
  user?: {
    userId: number;
    email: string;
  };
}

const allowedReasons = [
  "SPAM",
  "HARASSMENT",
  "OFFENSIVE_CONTENT",
  "HATE_SPEECH",
  "MISINFORMATION",
  "OTHER",
];

// =====================================================
// REPORT A COMMENT
// =====================================================

export const reportComment = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { commentId, reason } = req.body;

    if (!commentId || !reason) {
      return res.status(400).json({
        success: false,
        message: "Comment ID and report reason are required",
      });
    }

    const normalizedReason = String(reason).toUpperCase();

    if (!allowedReasons.includes(normalizedReason)) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid report reason. Use SPAM, HARASSMENT, OFFENSIVE_CONTENT, HATE_SPEECH, MISINFORMATION or OTHER",
      });
    }

    const comment = await prisma.comment.findUnique({
      where: {
        id: Number(commentId),
      },
    });

    if (!comment) {
      return res.status(404).json({
        success: false,
        message: "Comment not found",
      });
    }

    const existingReport =
      await prisma.commentReport.findUnique({
        where: {
          reporterId_commentId: {
            reporterId: req.user.userId,
            commentId: Number(commentId),
          },
        },
      });

    if (existingReport) {
      return res.status(409).json({
        success: false,
        message: "You have already reported this comment",
      });
    }

    const report = await prisma.commentReport.create({
      data: {
        reason: normalizedReason as
          | "SPAM"
          | "HARASSMENT"
          | "OFFENSIVE_CONTENT"
          | "HATE_SPEECH"
          | "MISINFORMATION"
          | "OTHER",
        reporterId: req.user.userId,
        commentId: Number(commentId),
      },

      include: {
        reporter: {
          select: {
            id: true,
            username: true,
          },
        },

        comment: {
          select: {
            id: true,
            content: true,
            language: true,
          },
        },
      },
    });

    return res.status(201).json({
      success: true,
      message: "Comment reported successfully",
      report,
    });
  } catch (error) {
    console.error("Report comment error:", error);

    return res.status(500).json({
      success: false,
      message: "Something went wrong",
    });
  }
};

// =====================================================
// GET ALL REPORTS
// =====================================================

export const getReports = async (
  req: Request,
  res: Response
) => {
  try {
    const status = req.query.status as string | undefined;

    const validStatuses = [
      "PENDING",
      "REVIEWED",
      "RESOLVED",
      "DISMISSED",
    ];

    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid status. Use PENDING, REVIEWED, RESOLVED or DISMISSED",
      });
    }

    const whereCondition = status
      ? {
          status: status as ReportStatus,
        }
      : {};

    const reports = await prisma.commentReport.findMany({
      where: whereCondition,

      include: {
        reporter: {
          select: {
            id: true,
            username: true,
            location: true,
            avatarUrl: true,
          },
        },

        comment: {
          select: {
            id: true,
            content: true,
            language: true,
            isEdited: true,
            createdAt: true,
            updatedAt: true,

            author: {
              select: {
                id: true,
                username: true,
                location: true,
                avatarUrl: true,
              },
            },
          },
        },
      },

      orderBy: {
        createdAt: "desc",
      },
    });

    return res.status(200).json({
      success: true,
      count: reports.length,
      reports,
    });
  } catch (error) {
    console.error("Get reports error:", error);

    return res.status(500).json({
      success: false,
      message: "Something went wrong",
    });
  }
};

// =====================================================
// UPDATE REPORT STATUS
// =====================================================

export const updateReportStatus = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const reportId = Number(req.params.id);
    const { status } = req.body;

    if (!reportId || Number.isNaN(reportId)) {
      return res.status(400).json({
        success: false,
        message: "Valid report ID is required",
      });
    }

    const validStatuses = [
      "PENDING",
      "REVIEWED",
      "RESOLVED",
      "DISMISSED",
    ];

    const normalizedStatus = String(status).toUpperCase();

    if (!validStatuses.includes(normalizedStatus)) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid status. Use PENDING, REVIEWED, RESOLVED or DISMISSED",
      });
    }

    const existingReport =
      await prisma.commentReport.findUnique({
        where: {
          id: reportId,
        },
      });

    if (!existingReport) {
      return res.status(404).json({
        success: false,
        message: "Report not found",
      });
    }

    const updatedReport =
      await prisma.commentReport.update({
        where: {
          id: reportId,
        },

        data: {
          status: normalizedStatus as ReportStatus,
        },

        include: {
          reporter: {
            select: {
              id: true,
              username: true,
            },
          },

          comment: {
            select: {
              id: true,
              content: true,
              language: true,
            },
          },
        },
      });

    return res.status(200).json({
      success: true,
      message: "Report status updated successfully",
      report: updatedReport,
    });
  } catch (error) {
    console.error("Update report status error:", error);

    return res.status(500).json({
      success: false,
      message: "Something went wrong",
    });
  }
};