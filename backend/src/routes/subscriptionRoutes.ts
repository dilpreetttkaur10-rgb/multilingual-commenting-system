import { Router } from "express";

import {
  getSubscriptionPlans,
  getCurrentSubscription,
  upgradeSubscription,
  downgradeSubscription,
  cancelSubscription,
  renewSubscription,
} from "../controllers/subscriptionController";

import { authMiddleware } from "../middleware/authMiddleware";

const router = Router();

// ==========================================
// SUBSCRIPTION ROUTES
// ==========================================

router.get(
  "/plans",
  getSubscriptionPlans
);

router.get(
  "/current",
  authMiddleware,
  getCurrentSubscription
);

router.post(
  "/upgrade",
  authMiddleware,
  upgradeSubscription
);

router.post(
  "/downgrade",
  authMiddleware,
  downgradeSubscription
);

router.post(
  "/cancel",
  authMiddleware,
  cancelSubscription
);

router.post(
  "/renew",
  authMiddleware,
  renewSubscription
);

export default router;