import { Router } from "express";

import {
  reportComment,
  getReports,
  updateReportStatus,
} from "../controllers/reportController";

import { authMiddleware } from "../middleware/authMiddleware";
import { adminMiddleware } from "../middleware/adminMiddleware";

const router = Router();

/*
  USER:
  Report a comment
*/
router.post(
  "/",
  authMiddleware,
  reportComment
);

/*
  ADMIN:
  View all reports
*/
router.get(
  "/",
  authMiddleware,
  adminMiddleware,
  getReports
);

/*
  ADMIN:
  Update report status
*/
router.patch(
  "/:id/status",
  authMiddleware,
  adminMiddleware,
  updateReportStatus
);

export default router;