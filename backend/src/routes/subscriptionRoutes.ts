import { Router } from "express";

import {
  getSubscriptionPlans,
  getCurrentSubscription,
  upgradeSubscription,
  renewSubscription,
} from "../controllers/subscriptionController";

import {
  authMiddleware,
} from "../middleware/authMiddleware";

const router = Router();

// ==========================================
// PUBLIC SUBSCRIPTION PLANS
// ==========================================

router.get(
  "/plans",
  getSubscriptionPlans
);

// ==========================================
// CURRENT SUBSCRIPTION
// ==========================================

router.get(
  "/current",
  authMiddleware,
  getCurrentSubscription
);

// ==========================================
// UPGRADE SUBSCRIPTION
// ==========================================

router.post(
  "/upgrade",
  authMiddleware,
  upgradeSubscription
);

// ==========================================
// RENEW SUBSCRIPTION
// ==========================================

router.post(
  "/renew",
  authMiddleware,
  renewSubscription
);

export default router;