import { Request, Response } from "express";
import { prisma } from "../utils/prisma";

interface AuthRequest extends Request {
  user?: {
    userId: number;
    email: string;
  };
}

// Like or dislike a comment
export const reactToComment = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const { commentId, type } = req.body;

    // Check authentication
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // Validate reaction type
    if (type !== "LIKE" && type !== "DISLIKE") {
      return res.status(400).json({
        success: false,
        message: "Reaction type must be LIKE or DISLIKE",
      });
    }

    // Validate comment ID is provided
    if (!commentId) {
      return res.status(400).json({
        success: false,
        message: "Comment ID is required",
      });
    }

    // Validate comment ID is a positive integer
    const numericCommentId = Number(commentId);

    if (
      !Number.isInteger(numericCommentId) ||
      numericCommentId <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Comment ID must be a valid number",
      });
    }

    // Check if comment exists
    const comment = await prisma.comment.findUnique({
      where: {
        id: numericCommentId,
      },
    });

    if (!comment) {
      return res.status(404).json({
        success: false,
        message: "Comment not found",
      });
    }

    // Check if comment was soft deleted
    if (comment.deletedAt) {
      return res.status(400).json({
        success: false,
        message: "Cannot react to a deleted comment",
      });
    }

    // Check if user already reacted
    const existingReaction =
      await prisma.commentReaction.findUnique({
        where: {
          userId_commentId: {
            userId: req.user.userId,
            commentId: numericCommentId,
          },
        },
      });

    // If reaction already exists, update it
    if (existingReaction) {
      const updatedReaction =
        await prisma.commentReaction.update({
          where: {
            id: existingReaction.id,
          },
          data: {
            type,
          },
        });

      return res.status(200).json({
        success: true,
        message: "Reaction updated successfully",
        reaction: updatedReaction,
      });
    }

    // Create new reaction
    const reaction =
      await prisma.commentReaction.create({
        data: {
          type,
          userId: req.user.userId,
          commentId: numericCommentId,
        },
      });

    return res.status(201).json({
      success: true,
      message: "Reaction added successfully",
      reaction,
    });
  } catch (error) {
    console.error("Reaction error:", error);

    return res.status(500).json({
      success: false,
      message: "Something went wrong",
    });
  }
};
