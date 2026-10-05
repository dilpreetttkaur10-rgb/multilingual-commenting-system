
import { Router } from "express";

import {
  createPaymentOrder,
  verifyPayment,
  failPayment,
  cancelPayment,
  getPaymentHistory,
  getPaymentDetails,
} from "../controllers/paymentController";

import { authMiddleware } from "../middleware/authMiddleware";

const router = Router();

// Create and verify payment
router.post("/orders", authMiddleware, createPaymentOrder);
router.post("/verify", authMiddleware, verifyPayment);

// Payment failure and cancellation
router.post("/:paymentId/fail", authMiddleware, failPayment);
router.post("/:paymentId/cancel", authMiddleware, cancelPayment);

// Payment history and transaction details
router.get("/history", authMiddleware, getPaymentHistory);
router.get("/:paymentId", authMiddleware, getPaymentDetails);

export default router;
