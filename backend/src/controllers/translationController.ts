import { Request, Response } from "express";
import { prisma } from "../utils/prisma";
import { translateText } from "../services/translationService";

const supportedLanguages = [
  "en",
  "hi",
  "pa",
  "fr",
  "de",
  "es",
  "it",
  "pt",
  "ru",
  "ar",
  "ja",
  "ko",
  "zh",
];

export const translateComment = async (
  req: Request,
  res: Response
) => {
  try {
    const { commentId, targetLanguage } = req.body;

    if (!commentId) {
      return res.status(400).json({
        success: false,
        message: "Comment ID is required",
      });
    }

    if (!targetLanguage || targetLanguage.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Target language is required",
      });
    }

    const target = targetLanguage.trim().toLowerCase();

    // Validate target language
    if (!supportedLanguages.includes(target)) {
      return res.status(400).json({
        success: false,
        message: "Invalid target language",
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

    if (!comment.language) {
      return res.status(400).json({
        success: false,
        message: "Comment language is not available",
      });
    }

    if (comment.language.toLowerCase() === target) {
      return res.status(400).json({
        success: false,
        message: "Source and target languages must be different",
      });
    }

    const translatedText = await translateText(
      comment.content,
      comment.language,
      target
    );

    if (!translatedText) {
      return res.status(503).json({
        success: false,
        message: "Translation service is currently unavailable",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Translation successful",
      commentId: comment.id,
      originalText: comment.content,
      sourceLanguage: comment.language,
      targetLanguage: target,
      translatedText,
    });
  } catch (error) {
    console.error("Translation controller error:", error);

    return res.status(500).json({
      success: false,
      message: "Something went wrong",
    });
  }
};