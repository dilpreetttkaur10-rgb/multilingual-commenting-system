import { Router } from "express";

import {
  createDownload,
  getDownloadHistory,
  updateDownloadStatus,
} from "../controllers/downloadController";

import {
  authMiddleware,
} from "../middleware/authMiddleware";

const router = Router();

// Create download
router.post(
  "/",
  authMiddleware,
  createDownload
);

// Get logged-in user's download history
router.get(
  "/",
  authMiddleware,
  getDownloadHistory
);

// Update download status
router.patch(
  "/:id/status",
  authMiddleware,
  updateDownloadStatus
);

export default router;