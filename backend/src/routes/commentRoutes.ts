import { Router } from "express";

import {
  createComment,
  getComments,
  editComment,
  deleteComment,
} from "../controllers/commentController";

import { reactToComment } from "../controllers/reactionController";
import { translateComment } from "../controllers/translationController";

import { authMiddleware } from "../middleware/authMiddleware";
import { commentRateLimiter } from "../middleware/rateLimitMiddleware";
import { captchaAttemptMiddleware } from "../middleware/captchaMiddleware";

const router = Router();

// ==========================================
// CREATE COMMENT
// ==========================================

router.post(
  "/",
  authMiddleware,
  captchaAttemptMiddleware,
  commentRateLimiter,
  createComment
);

// ==========================================
// GET COMMENTS
// ==========================================

router.get("/", getComments);

// ==========================================
// EDIT COMMENT
// ==========================================

router.patch(
  "/:id",
  authMiddleware,
  editComment
);

// ==========================================
// DELETE COMMENT
// ==========================================

router.delete(
  "/:id",
  authMiddleware,
  deleteComment
);

// ==========================================
// LIKE / DISLIKE
// ==========================================

router.post(
  "/reaction",
  authMiddleware,
  reactToComment
);

// ==========================================
// TRANSLATE COMMENT
// ==========================================

router.post(
  "/translate",
  authMiddleware,
  translateComment
);

export default router;