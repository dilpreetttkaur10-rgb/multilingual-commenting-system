import { Response } from "express";
import { AuthRequest } from "../middleware/authMiddleware";
import { prisma } from "../utils/prisma";

// ==========================================
// PLAN LEVEL HELPER
// ==========================================

const getPlanLevel = (planName: string): number => {
  const levels: Record<string, number> = {
    FREE: 0,
    BRONZE: 1,
    SILVER: 2,
    GOLD: 3,
  };

  return levels[planName.toUpperCase()] ?? -1;
};

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

      select: {
        id: true,
        name: true,
        price: true,
        durationDays: true,
        downloadLimit: true,
        maxFileSizeMB: true,
        premiumVideoAccess: true,
        streamingQuality: true,
        watchTimeMinutes: true,
        offlineDownloads: true,
        adFreeViewing: true,
        priorityContent: true,
        exclusiveCourses: true,
      },
    });

    const formattedPlans = plans.map((plan) => ({
      id: plan.id,
      name: plan.name,
      price: plan.price,
      durationDays: plan.durationDays,

      validity:
        plan.durationDays === 30
          ? "Monthly"
          : plan.durationDays === 90
          ? "Quarterly"
          : plan.durationDays === 365
          ? "Yearly"
          : `${plan.durationDays} days`,

      downloads: {
        limit: plan.downloadLimit,
        maxFileSizeMB: plan.maxFileSizeMB,
      },

      features: {
        premiumVideoAccess: plan.premiumVideoAccess,
        streamingQuality: plan.streamingQuality,
        watchTime:
          plan.watchTimeMinutes === 0
            ? "Unlimited"
            : `${plan.watchTimeMinutes} minutes`,
        offlineDownloads: plan.offlineDownloads,
        adFreeViewing: plan.adFreeViewing,
        priorityContent: plan.priorityContent,
        exclusiveCourses: plan.exclusiveCourses,
      },
    }));

    return res.status(200).json({
      success: true,
      message: "Subscription plans retrieved successfully",
      count: formattedPlans.length,
      plans: formattedPlans,
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
    // CALCULATE REMAINING DAYS
    // ==========================================

    const millisecondsRemaining =
      subscription.endDate.getTime() -
      now.getTime();

    const remainingDays = Math.ceil(
      millisecondsRemaining /
        (1000 * 60 * 60 * 24)
    );

    // ==========================================
    // CALCULATE REMAINING DOWNLOADS
    // ==========================================

    const downloadsRemaining = Math.max(
      subscription.plan.downloadLimit -
        subscription.downloadsUsed,
      0
    );

    // ==========================================
    // DASHBOARD RESPONSE
    // ==========================================

    return res.status(200).json({
      success: true,
      message:
        "Current subscription retrieved successfully",

      subscription: {
        id: subscription.id,

        plan: {
          id: subscription.plan.id,
          name: subscription.plan.name,
          price: subscription.plan.price,
        },

        startDate: subscription.startDate,

        endDate: subscription.endDate,

        remainingDays,

        nextRenewalDate: subscription.endDate,

        isActive: subscription.isActive,

        downloads: {
          limit: subscription.plan.downloadLimit,
          used: subscription.downloadsUsed,
          remaining: downloadsRemaining,
          maxFileSizeMB:
            subscription.plan.maxFileSizeMB,
        },

        features: {
          premiumVideoAccess:
            subscription.plan.premiumVideoAccess,

          streamingQuality:
            subscription.plan.streamingQuality,

          watchTimeMinutes:
            subscription.plan.watchTimeMinutes,

          offlineDownloads:
            subscription.plan.offlineDownloads,

          adFreeViewing:
            subscription.plan.adFreeViewing,

          priorityContent:
            subscription.plan.priorityContent,

          exclusiveCourses:
            subscription.plan.exclusiveCourses,
        },
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

    // ==========================================
    // FIND TARGET PLAN
    // ==========================================

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

    // ==========================================
    // FIND CURRENT SUBSCRIPTION
    // ==========================================

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
    // CHECK UPGRADE ELIGIBILITY
    // ==========================================

    if (currentSubscription) {
      const currentLevel = getPlanLevel(
        currentSubscription.plan.name
      );

      const targetLevel = getPlanLevel(
        plan.name
      );

      if (targetLevel <= currentLevel) {
        return res.status(400).json({
          success: false,

          message:
            "Selected plan is not an upgrade. Please choose a higher membership plan.",

          currentPlan:
            currentSubscription.plan.name,

          requestedPlan: plan.name,
        });
      }
    }

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

    // ==========================================
    // RESPONSE
    // ==========================================

    return res.status(201).json({
      success: true,

      message:
        "Subscription upgraded successfully",

      subscription: {
        id: newSubscription.id,

        plan: {
          id: newSubscription.plan.id,
          name: newSubscription.plan.name,
          price: newSubscription.plan.price,
        },

        startDate: newSubscription.startDate,

        endDate: newSubscription.endDate,

        isActive: newSubscription.isActive,

        downloads: {
          limit:
            newSubscription.plan.downloadLimit,

          used:
            newSubscription.downloadsUsed,

          remaining:
            newSubscription.plan.downloadLimit,

          maxFileSizeMB:
            newSubscription.plan.maxFileSizeMB,
        },

        features: {
          premiumVideoAccess:
            newSubscription.plan
              .premiumVideoAccess,

          streamingQuality:
            newSubscription.plan
              .streamingQuality,

          watchTimeMinutes:
            newSubscription.plan
              .watchTimeMinutes,

          offlineDownloads:
            newSubscription.plan
              .offlineDownloads,

          adFreeViewing:
            newSubscription.plan
              .adFreeViewing,

          priorityContent:
            newSubscription.plan
              .priorityContent,

          exclusiveCourses:
            newSubscription.plan
              .exclusiveCourses,
        },
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
// DOWNGRADE SUBSCRIPTION
// ==========================================

export const downgradeSubscription = async (
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

    // ==========================================
    // FIND TARGET PLAN
    // ==========================================

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

    // ==========================================
    // FIND CURRENT SUBSCRIPTION
    // ==========================================

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

    if (!currentSubscription) {
      return res.status(404).json({
        success: false,
        message: "No active subscription found",
      });
    }

    // ==========================================
    // CHECK DOWNGRADE ELIGIBILITY
    // ==========================================

    const currentLevel = getPlanLevel(
      currentSubscription.plan.name
    );

    const targetLevel = getPlanLevel(
      plan.name
    );

    if (targetLevel >= currentLevel) {
      return res.status(400).json({
        success: false,

        message:
          "Selected plan is not a downgrade. Please choose a lower membership plan.",

        currentPlan:
          currentSubscription.plan.name,

        requestedPlan: plan.name,
      });
    }

    // ==========================================
    // DEACTIVATE CURRENT SUBSCRIPTION
    // ==========================================

    await prisma.userSubscription.update({
      where: {
        id: currentSubscription.id,
      },

      data: {
        isActive: false,
      },
    });

    // ==========================================
    // CREATE DOWNGRADED SUBSCRIPTION
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

    // ==========================================
    // RESPONSE
    // ==========================================

    return res.status(201).json({
      success: true,

      message:
        "Subscription downgraded successfully",

      subscription: {
        id: newSubscription.id,

        plan: {
          id: newSubscription.plan.id,
          name: newSubscription.plan.name,
          price: newSubscription.plan.price,
        },

        startDate: newSubscription.startDate,

        endDate: newSubscription.endDate,

        isActive: newSubscription.isActive,

        downloads: {
          limit:
            newSubscription.plan.downloadLimit,

          used:
            newSubscription.downloadsUsed,

          remaining:
            newSubscription.plan.downloadLimit,

          maxFileSizeMB:
            newSubscription.plan.maxFileSizeMB,
        },

        features: {
          premiumVideoAccess:
            newSubscription.plan
              .premiumVideoAccess,

          streamingQuality:
            newSubscription.plan
              .streamingQuality,

          watchTimeMinutes:
            newSubscription.plan
              .watchTimeMinutes,

          offlineDownloads:
            newSubscription.plan
              .offlineDownloads,

          adFreeViewing:
            newSubscription.plan
              .adFreeViewing,

          priorityContent:
            newSubscription.plan
              .priorityContent,

          exclusiveCourses:
            newSubscription.plan
              .exclusiveCourses,
        },
      },
    });
  } catch (error) {
    console.error(
      "Downgrade subscription error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Something went wrong",
    });
  }
};

// ==========================================
// CANCEL SUBSCRIPTION
// ==========================================

export const cancelSubscription = async (
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

    // ==========================================
    // FIND ACTIVE SUBSCRIPTION
    // ==========================================

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

    if (!currentSubscription) {
      return res.status(404).json({
        success: false,
        message:
          "No active subscription found to cancel",
      });
    }

    // ==========================================
    // CHECK EXPIRY
    // ==========================================

    const now = new Date();

    if (currentSubscription.endDate <= now) {
      await prisma.userSubscription.update({
        where: {
          id: currentSubscription.id,
        },

        data: {
          isActive: false,
        },
      });

      return res.status(400).json({
        success: false,
        message: "Subscription has already expired",
      });
    }

    // ==========================================
    // CANCEL SUBSCRIPTION
    // ==========================================

    const cancelledSubscription =
      await prisma.userSubscription.update({
        where: {
          id: currentSubscription.id,
        },

        data: {
          isActive: false,
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

      message:
        "Subscription cancelled successfully",

      subscription: {
        id: cancelledSubscription.id,

        plan: {
          id: cancelledSubscription.plan.id,
          name: cancelledSubscription.plan.name,
          price: cancelledSubscription.plan.price,
        },

        startDate:
          cancelledSubscription.startDate,

        endDate:
          cancelledSubscription.endDate,

        isActive:
          cancelledSubscription.isActive,

        cancelledAt: new Date(),

        downloads: {
          limit:
            cancelledSubscription.plan.downloadLimit,

          used:
            cancelledSubscription.downloadsUsed,

          remaining: Math.max(
            cancelledSubscription.plan.downloadLimit -
              cancelledSubscription.downloadsUsed,
            0
          ),

          maxFileSizeMB:
            cancelledSubscription.plan.maxFileSizeMB,
        },
      },
    });
  } catch (error) {
    console.error(
      "Cancel subscription error:",
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

    if (subscription.endDate > now) {
      return res.status(400).json({
        success: false,

        message:
          "Subscription is still active and cannot be renewed yet",

        endDate: subscription.endDate,
      });
    }

    const startDate = new Date();

    const endDate = new Date(startDate);

    endDate.setDate(
      endDate.getDate() +
        subscription.plan.durationDays
    );

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

    return res.status(200).json({
      success: true,

      message:
        "Subscription renewed successfully",

      subscription: {
        id: renewedSubscription.id,

        plan: {
          id: renewedSubscription.plan.id,
          name: renewedSubscription.plan.name,
          price: renewedSubscription.plan.price,
        },

        startDate:
          renewedSubscription.startDate,

        endDate:
          renewedSubscription.endDate,

        isActive:
          renewedSubscription.isActive,

        downloads: {
          limit:
            renewedSubscription.plan
              .downloadLimit,

          used:
            renewedSubscription.downloadsUsed,

          remaining:
            renewedSubscription.plan
              .downloadLimit,

          maxFileSizeMB:
            renewedSubscription.plan
              .maxFileSizeMB,
        },

        features: {
          premiumVideoAccess:
            renewedSubscription.plan
              .premiumVideoAccess,

          streamingQuality:
            renewedSubscription.plan
              .streamingQuality,

          watchTimeMinutes:
            renewedSubscription.plan
              .watchTimeMinutes,

          offlineDownloads:
            renewedSubscription.plan
              .offlineDownloads,

          adFreeViewing:
            renewedSubscription.plan
              .adFreeViewing,

          priorityContent:
            renewedSubscription.plan
              .priorityContent,

          exclusiveCourses:
            renewedSubscription.plan
              .exclusiveCourses,
        },
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