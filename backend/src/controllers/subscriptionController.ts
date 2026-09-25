import { Response } from "express";
import { AuthRequest } from "../middleware/authMiddleware";
import { prisma } from "../utils/prisma";

// ==========================================
// GET SUBSCRIPTION PLANS
// ==========================================

export const getSubscriptionPlans = async (
  _req: any,
  res: Response
) => {
  try {
    const plans = await prisma.subscriptionPlan.findMany({
      orderBy: {
        price: "asc",
      },
    });

    return res.status(200).json({
      success: true,
      message: "Subscription plans retrieved successfully",
      count: plans.length,
      plans,
    });
  } catch (error) {
    console.error("Get subscription plans error:", error);

    return res.status(500).json({
      success: false,
      message: "Something went wrong",
    });
  }
};

// ==========================================
// GET CURRENT SUBSCRIPTION
// ==========================================

export const getCurrentSubscription = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const subscription =
      await prisma.userSubscription.findFirst({
        where: {
          userId,
          isActive: true,
        },
        include: {
          plan: true,
        },
        orderBy: {
          endDate: "desc",
        },
      });

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: "No active subscription found",
      });
    }

    const now = new Date();

    // ==========================================
    // CHECK EXPIRY
    // ==========================================

    if (subscription.endDate <= now) {
      await prisma.userSubscription.update({
        where: {
          id: subscription.id,
        },
        data: {
          isActive: false,
        },
      });

      return res.status(403).json({
        success: false,
        message: "Subscription has expired",
      });
    }

    // ==========================================
    // CALCULATE REMAINING DOWNLOADS
    // ==========================================

    const downloadsRemaining = Math.max(
      subscription.plan.downloadLimit -
        subscription.downloadsUsed,
      0
    );

    return res.status(200).json({
      success: true,
      message: "Current subscription retrieved successfully",
      subscription: {
        id: subscription.id,
        plan: subscription.plan.name,
        price: subscription.plan.price,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        isActive: subscription.isActive,
        downloadsLimit: subscription.plan.downloadLimit,
        downloadsUsed: subscription.downloadsUsed,
        downloadsRemaining,
        maxFileSizeMB:
          subscription.plan.maxFileSizeMB,
      },
    });
  } catch (error) {
    console.error(
      "Get current subscription error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Something went wrong",
    });
  }
};

// ==========================================
// UPGRADE SUBSCRIPTION
// ==========================================

export const upgradeSubscription = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { planId } = req.body;

    if (!planId) {
      return res.status(400).json({
        success: false,
        message: "Plan ID is required",
      });
    }

    const numericPlanId = Number(planId);

    if (!Number.isInteger(numericPlanId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid plan ID",
      });
    }

    const plan =
      await prisma.subscriptionPlan.findUnique({
        where: {
          id: numericPlanId,
        },
      });

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: "Subscription plan not found",
      });
    }

    if (plan.name === "FREE") {
      return res.status(400).json({
        success: false,
        message:
          "FREE plan cannot be selected for upgrade",
      });
    }

    const currentSubscription =
      await prisma.userSubscription.findFirst({
        where: {
          userId,
          isActive: true,
        },
        include: {
          plan: true,
        },
        orderBy: {
          endDate: "desc",
        },
      });

    // ==========================================
    // DEACTIVATE CURRENT SUBSCRIPTION
    // ==========================================

    if (currentSubscription) {
      await prisma.userSubscription.update({
        where: {
          id: currentSubscription.id,
        },
        data: {
          isActive: false,
        },
      });
    }

    // ==========================================
    // CREATE NEW SUBSCRIPTION
    // ==========================================

    const startDate = new Date();

    const endDate = new Date(startDate);

    endDate.setDate(
      endDate.getDate() + plan.durationDays
    );

    const newSubscription =
      await prisma.userSubscription.create({
        data: {
          userId,
          planId: plan.id,
          startDate,
          endDate,
          isActive: true,
          downloadsUsed: 0,
        },
        include: {
          plan: true,
        },
      });

    return res.status(201).json({
      success: true,
      message: "Subscription upgraded successfully",
      subscription: {
        id: newSubscription.id,
        plan: newSubscription.plan.name,
        price: newSubscription.plan.price,
        startDate: newSubscription.startDate,
        endDate: newSubscription.endDate,
        isActive: newSubscription.isActive,
        downloadsLimit:
          newSubscription.plan.downloadLimit,
        downloadsUsed:
          newSubscription.downloadsUsed,
        downloadsRemaining:
          newSubscription.plan.downloadLimit,
        maxFileSizeMB:
          newSubscription.plan.maxFileSizeMB,
      },
    });
  } catch (error) {
    console.error(
      "Upgrade subscription error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Something went wrong",
    });
  }
};

// ==========================================
// RENEW SUBSCRIPTION
// ==========================================

export const renewSubscription = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const subscription =
      await prisma.userSubscription.findFirst({
        where: {
          userId,
        },
        include: {
          plan: true,
        },
        orderBy: {
          id: "desc",
        },
      });

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: "No subscription found",
      });
    }

    const now = new Date();

    // ==========================================
    // CHECK WHETHER STILL ACTIVE
    // ==========================================

    if (subscription.endDate > now) {
      return res.status(400).json({
        success: false,
        message:
          "Subscription is still active and cannot be renewed yet",
        endDate: subscription.endDate,
      });
    }

    // ==========================================
    // CREATE NEW DATES
    // ==========================================

    const startDate = new Date();

    const endDate = new Date(startDate);

    endDate.setDate(
      endDate.getDate() +
        subscription.plan.durationDays
    );

    // ==========================================
    // RENEW SUBSCRIPTION
    // ==========================================

    const renewedSubscription =
      await prisma.userSubscription.update({
        where: {
          id: subscription.id,
        },
        data: {
          startDate,
          endDate,
          isActive: true,
          downloadsUsed: 0,
        },
        include: {
          plan: true,
        },
      });

    // ==========================================
    // RESPONSE
    // ==========================================

    return res.status(200).json({
      success: true,
      message: "Subscription renewed successfully",
      subscription: {
        id: renewedSubscription.id,
        plan: renewedSubscription.plan.name,
        price: renewedSubscription.plan.price,
        startDate: renewedSubscription.startDate,
        endDate: renewedSubscription.endDate,
        isActive: renewedSubscription.isActive,
        downloadsLimit:
          renewedSubscription.plan.downloadLimit,
        downloadsUsed:
          renewedSubscription.downloadsUsed,
        downloadsRemaining:
          renewedSubscription.plan.downloadLimit,
        maxFileSizeMB:
          renewedSubscription.plan.maxFileSizeMB,
      },
    });
  } catch (error) {
    console.error(
      "Renew subscription error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Something went wrong",
    });
  }
};
