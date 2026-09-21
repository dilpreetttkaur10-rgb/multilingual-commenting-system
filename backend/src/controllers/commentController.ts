
import { Request, Response } from "express";
import { prisma } from "../utils/prisma";
import { detectLanguage } from "../services/languageService";

import {
  containsProfanity,
  isSpam,
  containsMaliciousLink,
  hasExcessiveRepetition,
} from "../services/moderationService";

interface AuthRequest extends Request {
  user?: {
    userId: number;
    email: string;
  };
}

// ======================================================
// CREATE COMMENT
// ======================================================

export const createComment = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const { content, parentId } = req.body;

    // Authentication check
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // Content validation
    if (!content || content.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Comment content is required",
      });
    }

    const cleanedContent = content.trim();

    // Moderation checks
    if (containsProfanity(cleanedContent)) {
      return res.status(400).json({
        success: false,
        message: "Comment contains inappropriate language",
      });
    }

    if (isSpam(cleanedContent)) {
      return res.status(400).json({
        success: false,
        message: "Comment detected as spam",
      });
    }

    if (containsMaliciousLink(cleanedContent)) {
      return res.status(400).json({
        success: false,
        message:
          "Comment contains a suspicious or malicious link",
      });
    }

    if (hasExcessiveRepetition(cleanedContent)) {
      return res.status(400).json({
        success: false,
        message:
          "Comment contains excessive repeated characters or emojis",
      });
    }

    // Parent ID validation
    const normalizedParentId =
      parentId !== undefined && parentId !== null
        ? Number(parentId)
        : null;

    if (
      normalizedParentId !== null &&
      (Number.isNaN(normalizedParentId) ||
        !Number.isInteger(normalizedParentId) ||
        normalizedParentId <= 0)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid parent comment ID",
      });
    }

    // Duplicate comment check
    const existingComment = await prisma.comment.findFirst({
      where: {
        content: cleanedContent,
        authorId: req.user.userId,
        parentId: normalizedParentId,
        deletedAt: null,
      },
    });

    if (existingComment) {
      return res.status(409).json({
        success: false,
        message: "Duplicate comment is not allowed",
      });
    }

    // Check parent comment
    if (normalizedParentId !== null) {
      const parentComment = await prisma.comment.findUnique({
        where: {
          id: normalizedParentId,
        },
      });

      // Parent does not exist
      if (!parentComment) {
        return res.status(404).json({
          success: false,
          message: "Parent comment not found",
        });
      }

      // Parent was soft deleted
      if (parentComment.deletedAt) {
        return res.status(400).json({
          success: false,
          message:
            "Cannot reply to a deleted comment",
        });
      }
    }

    // Detect language
    const detectedLanguage = detectLanguage(cleanedContent);

    // Create comment
    const comment = await prisma.comment.create({
      data: {
        content: cleanedContent,
        language: detectedLanguage,
        authorId: req.user.userId,
        parentId: normalizedParentId,
      },

      include: {
        author: {
          select: {
            id: true,
            username: true,
            email: true,
            location: true,
            avatarUrl: true,
          },
        },
      },
    });

    // Detect mentions
    const mentionedUsernames =
      cleanedContent.match(/@[a-zA-Z0-9_]+/g) || [];

    const mentionedUsers: {
      id: number;
      username: string;
    }[] = [];

    for (const mention of mentionedUsernames) {
      const username = mention.substring(1);

      const mentionedUser = await prisma.user.findUnique({
        where: {
          username,
        },

        select: {
          id: true,
          username: true,
        },
      });

      if (mentionedUser) {
        mentionedUsers.push(mentionedUser);
      }
    }

    console.log("Mentioned users:", mentionedUsers);

    return res.status(201).json({
      success: true,

      message: normalizedParentId
        ? "Reply created successfully"
        : "Comment created successfully",

      comment,
      mentionedUsers,
    });
  } catch (error) {
    console.error("Create comment error:", error);

    return res.status(500).json({
      success: false,
      message: "Something went wrong",
    });
  }
};

// ======================================================
// GET COMMENTS
// ======================================================

export const getComments = async (
  req: Request,
  res: Response
) => {
  try {
    const sort =
      (req.query.sort as string) || "newest";

    const comments = await prisma.comment.findMany({
      where: {
        parentId: null,
        deletedAt: null,
      },

      include: {
        author: {
          select: {
            id: true,
            username: true,
            email: true,
            location: true,
            avatarUrl: true,
          },
        },

        replies: {
          where: {
            deletedAt: null,
          },

          include: {
            author: {
              select: {
                id: true,
                username: true,
                email: true,
                location: true,
                avatarUrl: true,
              },
            },

            reactions: true,
          },
        },

        reactions: true,
      },
    });

    const formattedComments = comments.map(
      (comment) => {
        const likeCount =
          comment.reactions.filter(
            (reaction) =>
              reaction.type === "LIKE"
          ).length;

        const dislikeCount =
          comment.reactions.filter(
            (reaction) =>
              reaction.type === "DISLIKE"
          ).length;

        const relevanceScore =
          likeCount + comment.replies.length;

        return {
          id: comment.id,
          content: comment.content,
          language: comment.language,
          isEdited: comment.isEdited,
          createdAt: comment.createdAt,
          updatedAt: comment.updatedAt,
          author: comment.author,

          likeCount,
          dislikeCount,

          replyCount:
            comment.replies.length,

          relevanceScore,

          replies: comment.replies.map(
            (reply) => {
              const replyLikeCount =
                reply.reactions.filter(
                  (reaction) =>
                    reaction.type === "LIKE"
                ).length;

              const replyDislikeCount =
                reply.reactions.filter(
                  (reaction) =>
                    reaction.type === "DISLIKE"
                ).length;

              return {
                id: reply.id,
                content: reply.content,
                language: reply.language,
                isEdited: reply.isEdited,
                createdAt: reply.createdAt,
                updatedAt: reply.updatedAt,
                author: reply.author,

                likeCount:
                  replyLikeCount,

                dislikeCount:
                  replyDislikeCount,
              };
            }
          ),
        };
      }
    );

    // ==================================================
    // SORTING
    // ==================================================

    switch (sort) {
      case "oldest":
        formattedComments.sort(
          (a, b) =>
            new Date(
              a.createdAt
            ).getTime() -
            new Date(
              b.createdAt
            ).getTime()
        );
        break;

      case "mostLiked":
        formattedComments.sort(
          (a, b) =>
            b.likeCount -
            a.likeCount
        );
        break;

      case "mostRelevant":
        formattedComments.sort(
          (a, b) =>
            b.relevanceScore -
            a.relevanceScore
        );
        break;

      case "newest":
      default:
        formattedComments.sort(
          (a, b) =>
            new Date(
              b.createdAt
            ).getTime() -
            new Date(
              a.createdAt
            ).getTime()
        );
        break;
    }

    return res.status(200).json({
      success: true,
      sort,
      count: formattedComments.length,
      comments: formattedComments,
    });
  } catch (error) {
    console.error(
      "Get comments error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Something went wrong",
    });
  }
};

// ======================================================
// EDIT COMMENT
// ======================================================

export const editComment = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    // Authentication
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const commentId =
      Number(req.params.id);

    const { content } = req.body;

    // Comment ID validation
    if (
      !commentId ||
      Number.isNaN(commentId) ||
      !Number.isInteger(commentId) ||
      commentId <= 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Valid comment ID is required",
      });
    }

    // Content validation
    if (
      !content ||
      content.trim() === ""
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Comment content is required",
      });
    }

    const cleanedContent =
      content.trim();

    // Find comment
    const comment =
      await prisma.comment.findUnique({
        where: {
          id: commentId,
        },
      });

    if (!comment) {
      return res.status(404).json({
        success: false,
        message: "Comment not found",
      });
    }

    // Deleted comment
    if (comment.deletedAt) {
      return res.status(400).json({
        success: false,
        message:
          "Deleted comments cannot be edited",
      });
    }

    // Ownership
    if (
      comment.authorId !==
      req.user.userId
    ) {
      return res.status(403).json({
        success: false,
        message:
          "You can only edit your own comments",
      });
    }

    // 15-minute edit limit
    const EDIT_LIMIT_MS =
      15 * 60 * 1000;

    const age =
      Date.now() -
      comment.createdAt.getTime();

    if (age > EDIT_LIMIT_MS) {
      return res.status(403).json({
        success: false,
        message:
          "Edit time limit expired. Comments can only be edited within 15 minutes.",
      });
    }

    // Moderation checks
    if (
      containsProfanity(
        cleanedContent
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Comment contains inappropriate language",
      });
    }

    if (isSpam(cleanedContent)) {
      return res.status(400).json({
        success: false,
        message:
          "Comment detected as spam",
      });
    }

    if (
      containsMaliciousLink(
        cleanedContent
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Comment contains a suspicious or malicious link",
      });
    }

    if (
      hasExcessiveRepetition(
        cleanedContent
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Comment contains excessive repeated characters or emojis",
      });
    }

    // Same content
    if (
      cleanedContent ===
      comment.content
    ) {
      return res.status(400).json({
        success: false,
        message:
          "New content must be different",
      });
    }

    // Detect new language
    const detectedLanguage =
      detectLanguage(
        cleanedContent
      );

    // Update + history transaction
    const updatedComment =
      await prisma.$transaction(
        async (tx) => {
          const history =
            await tx.commentHistory.create({
              data: {
                action: "EDIT",
                oldContent:
                  comment.content,
                newContent:
                  cleanedContent,
                commentId:
                  comment.id,
                actorId:
                  req.user!.userId,
              },
            });

          const updated =
            await tx.comment.update({
              where: {
                id: comment.id,
              },

              data: {
                content:
                  cleanedContent,
                language:
                  detectedLanguage,
                isEdited: true,
              },

              include: {
                author: {
                  select: {
                    id: true,
                    username: true,
                    email: true,
                    location: true,
                    avatarUrl: true,
                  },
                },
              },
            });

          return {
            updated,
            history,
          };
        }
      );

    return res.status(200).json({
      success: true,
      message:
        "Comment edited successfully",
      comment:
        updatedComment.updated,
      history:
        updatedComment.history,
    });
  } catch (error) {
    console.error(
      "Edit comment error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Something went wrong",
    });
  }
};

// ======================================================
// DELETE COMMENT
// ======================================================

export const deleteComment = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    // Authentication
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message:
          "Authentication required",
      });
    }

    const commentId =
      Number(req.params.id);

    // Comment ID validation
    if (
      !commentId ||
      Number.isNaN(commentId) ||
      !Number.isInteger(commentId) ||
      commentId <= 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Valid comment ID is required",
      });
    }

    // Find comment
    const comment =
      await prisma.comment.findUnique({
        where: {
          id: commentId,
        },
      });

    if (!comment) {
      return res.status(404).json({
        success: false,
        message:
          "Comment not found",
      });
    }

    // Already deleted
    if (comment.deletedAt) {
      return res.status(400).json({
        success: false,
        message:
          "Comment is already deleted",
      });
    }

    // Ownership
    if (
      comment.authorId !==
      req.user.userId
    ) {
      return res.status(403).json({
        success: false,
        message:
          "You can only delete your own comments",
      });
    }

    // 15-minute delete limit
    const DELETE_LIMIT_MS =
      15 * 60 * 1000;

    const age =
      Date.now() -
      comment.createdAt.getTime();

    if (age > DELETE_LIMIT_MS) {
      return res.status(403).json({
        success: false,
        message:
          "Delete time limit expired. Comments can only be deleted within 15 minutes.",
      });
    }

    // Delete + history transaction
    const result =
      await prisma.$transaction(
        async (tx) => {
          const history =
            await tx.commentHistory.create({
              data: {
                action: "DELETE",
                oldContent:
                  comment.content,
                newContent: null,
                commentId:
                  comment.id,
                actorId:
                  req.user!.userId,
              },
            });

          const deletedComment =
            await tx.comment.update({
              where: {
                id: comment.id,
              },

              data: {
                deletedAt:
                  new Date(),
              },
            });

          return {
            deletedComment,
            history,
          };
        }
      );

    return res.status(200).json({
      success: true,
      message:
        "Comment deleted successfully",

      comment: {
        id:
          result.deletedComment.id,

        deletedAt:
          result.deletedComment
            .deletedAt,
      },

      history:
        result.history,
    });
  } catch (error) {
    console.error(
      "Delete comment error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Something went wrong",
    });
  }
};