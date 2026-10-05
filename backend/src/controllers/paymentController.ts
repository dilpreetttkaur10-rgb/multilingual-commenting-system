

import { Request, Response } from "express";
import crypto from "crypto";
import { prisma } from "../utils/prisma";
import {
  razorpay,
  isRazorpayConfigured,
} from "../services/razorpayService";
import { sendPaymentConfirmationEmail } from "../services/emailService";

type AuthenticatedRequest = Request & {
  user?: {
    userId: number;
  };
};

// ==========================================
// CREATE PAYMENT ORDER
// ==========================================

export const createPaymentOrder = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.userId;
    const { planId } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    if (!planId || !Number.isInteger(Number(planId))) {
      return res.status(400).json({
        success: false,
        message: "A valid planId is required",
      });
    }

    const plan = await prisma.subscriptionPlan.findUnique({
      where: { id: Number(planId) },
    });

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: "Subscription plan not found",
      });
    }

    if (plan.name.toUpperCase() === "FREE") {
      return res.status(400).json({
        success: false,
        message: "FREE plan does not require payment",
      });
    }

    if (Number(plan.price) <= 0) {
      return res.status(400).json({
        success: false,
        message: "Selected plan has no payable amount",
      });
    }

    const amountInPaise = Math.round(Number(plan.price) * 100);

    if (isRazorpayConfigured) {
      const razorpayOrder = await razorpay.orders.create({
        amount: amountInPaise,
        currency: "INR",
        receipt: `sub_${userId}_${Date.now()}`,
      });

      const payment = await prisma.payment.create({
        data: {
          userId,
          planId: plan.id,
          razorpayOrderId: razorpayOrder.id,
          amount: plan.price,
          currency: "INR",
          status: "CREATED",
        },
      });

      return res.status(201).json({
        success: true,
        mode: "razorpay",
        message: "Payment order created successfully",
        order: {
          id: razorpayOrder.id,
          amount: razorpayOrder.amount,
          currency: razorpayOrder.currency,
        },
        payment: {
          id: payment.id,
          status: payment.status,
        },
        plan: {
          id: plan.id,
          name: plan.name,
          price: plan.price,
        },
      });
    }

    // Local development mock mode
    const mockOrderId = `mock_order_${userId}_${Date.now()}`;

    const payment = await prisma.payment.create({
      data: {
        userId,
        planId: plan.id,
        razorpayOrderId: mockOrderId,
        amount: plan.price,
        currency: "INR",
        status: "CREATED",
      },
    });

    return res.status(201).json({
      success: true,
      mode: "mock",
      message: "Mock payment order created successfully",
      warning:
        "This is a local development order, not a real Razorpay payment.",
      order: {
        id: mockOrderId,
        amount: amountInPaise,
        currency: "INR",
      },
      payment: {
        id: payment.id,
        status: payment.status,
      },
      plan: {
        id: plan.id,
        name: plan.name,
        price: plan.price,
      },
    });
  } catch (error) {
    console.error("Create payment order error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create payment order",
    });
  }
};

// ==========================================
// VERIFY PAYMENT AND ACTIVATE SUBSCRIPTION
// ==========================================

export const verifyPayment = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.userId;

    const {
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    if (
      typeof razorpayOrderId !== "string" ||
      typeof razorpayPaymentId !== "string" ||
      typeof razorpaySignature !== "string" ||
      !razorpayOrderId.trim() ||
      !razorpayPaymentId.trim() ||
      !razorpaySignature.trim()
    ) {
      return res.status(400).json({
        success: false,
        message:
          "razorpayOrderId, razorpayPaymentId and razorpaySignature are required",
      });
    }

    const payment = await prisma.payment.findFirst({
      where: {
        razorpayOrderId,
        userId,
      },
      include: {
        plan: true,
      },
    });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment record not found",
      });
    }

    if (payment.status !== "CREATED") {
      return res.status(400).json({
        success: false,
        message:
          payment.status === "SUCCESS"
            ? "Payment has already been verified"
            : "This payment cannot be verified",
      });
    }

    // REAL RAZORPAY SIGNATURE VERIFICATION
    if (isRazorpayConfigured) {
      const secret = process.env.RAZORPAY_KEY_SECRET;

      if (!secret) {
        return res.status(500).json({
          success: false,
          message: "Razorpay secret is not configured",
        });
      }

      const generatedSignature = crypto
        .createHmac("sha256", secret)
        .update(`${razorpayOrderId}|${razorpayPaymentId}`)
        .digest("hex");

      const expectedBuffer = Buffer.from(generatedSignature, "hex");
      const receivedBuffer = Buffer.from(razorpaySignature, "hex");

      if (
        expectedBuffer.length !== receivedBuffer.length ||
        !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid payment signature",
        });
      }
    }

    // ACTIVATE SUBSCRIPTION IN A TRANSACTION
    const result = await prisma.$transaction(async (tx) => {
      // Claim the CREATED payment so it cannot be processed twice.
      const claimedPayment = await tx.payment.updateMany({
        where: {
          id: payment.id,
          userId,
          status: "CREATED",
        },
        data: {
          razorpayPaymentId,
          razorpaySignature,
          status: "SUCCESS",
          invoiceNumber: `INV-${payment.id
            .toString()
            .padStart(6, "0")}`,
        },
      });

      if (claimedPayment.count !== 1) {
        throw new Error("PAYMENT_ALREADY_PROCESSED");
      }

      const now = new Date();
      const endDate = new Date(now);
      endDate.setDate(endDate.getDate() + payment.plan.durationDays);

      // Deactivate previous active subscriptions.
      await tx.userSubscription.updateMany({
        where: {
          userId,
          isActive: true,
        },
        data: {
          isActive: false,
        },
      });

      // Create the new subscription.
      const subscription = await tx.userSubscription.create({
        data: {
          userId,
          planId: payment.planId,
          startDate: now,
          endDate,
          isActive: true,
          downloadsUsed: 0,
        },
      });

      // Link the payment to the new subscription.
      const updatedPayment = await tx.payment.update({
        where: {
          id: payment.id,
        },
        data: {
          subscriptionId: subscription.id,
        },
      });

      return {
        subscription,
        payment: updatedPayment,
      };
    });

    // SEND PAYMENT CONFIRMATION EMAIL
    // Email failure must not undo a successful payment.
    let emailResult = {
      success: false,
      previewUrl: null as string | null,
    };

    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
      });

      if (user?.email && result.payment.invoiceNumber) {
        emailResult = await sendPaymentConfirmationEmail({
          email: user.email,
          customerName: user.email,
          invoiceNumber: result.payment.invoiceNumber,
          planName: payment.plan.name,
          amount: result.payment.amount.toString(),
          currency: result.payment.currency,
          paymentId: result.payment.id,
          subscriptionStart: result.subscription.startDate,
          subscriptionEnd: result.subscription.endDate,
        });
      } else {
        console.error(
          "Confirmation email skipped: user email or invoice number missing"
        );
      }
    } catch (emailError) {
      console.error("Confirmation email error:", emailError);
    }

    return res.status(200).json({
      success: true,
      mode: isRazorpayConfigured ? "razorpay" : "mock",
      message: "Payment verified and subscription activated successfully",
      payment: {
        id: result.payment.id,
        status: result.payment.status,
        invoiceNumber: result.payment.invoiceNumber,
        razorpayOrderId: result.payment.razorpayOrderId,
        razorpayPaymentId: result.payment.razorpayPaymentId,
        subscriptionId: result.payment.subscriptionId,
      },
      subscription: {
        id: result.subscription.id,
        userId: result.subscription.userId,
        planId: result.subscription.planId,
        startDate: result.subscription.startDate,
        endDate: result.subscription.endDate,
        isActive: result.subscription.isActive,
      },
      email: emailResult,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "PAYMENT_ALREADY_PROCESSED"
    ) {
      return res.status(409).json({
        success: false,
        message: "Payment has already been processed",
      });
    }

    console.error("Verify payment error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to verify payment",
    });
  }
};

// ==========================================
// HANDLE PAYMENT FAILURE
// ==========================================

export const failPayment = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.userId;
    const paymentId = Number(req.params.paymentId);
    const { failureReason } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    if (!Number.isInteger(paymentId) || paymentId <= 0) {
      return res.status(400).json({
        success: false,
        message: "A valid paymentId is required",
      });
    }

    const updated = await prisma.payment.updateMany({
      where: {
        id: paymentId,
        userId,
        status: "CREATED",
      },
      data: {
        status: "FAILED",
        failureReason:
          typeof failureReason === "string"
            ? failureReason.slice(0, 500)
            : "Payment failed",
      },
    });

    if (updated.count === 0) {
      return res.status(404).json({
        success: false,
        message:
          "Payment not found, or it has already been processed",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Payment marked as failed",
      payment: {
        id: paymentId,
        status: "FAILED",
      },
    });
  } catch (error) {
    console.error("Fail payment error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update payment status",
    });
  }
};

// ==========================================
// HANDLE PAYMENT CANCELLATION
// ==========================================

export const cancelPayment = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.userId;
    const paymentId = Number(req.params.paymentId);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    if (!Number.isInteger(paymentId) || paymentId <= 0) {
      return res.status(400).json({
        success: false,
        message: "A valid paymentId is required",
      });
    }

    const updated = await prisma.payment.updateMany({
      where: {
        id: paymentId,
        userId,
        status: "CREATED",
      },
      data: {
        status: "CANCELLED",
      },
    });

    if (updated.count === 0) {
      return res.status(404).json({
        success: false,
        message:
          "Payment not found, or it has already been processed",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Payment cancelled successfully",
      payment: {
        id: paymentId,
        status: "CANCELLED",
      },
    });
  } catch (error) {
    console.error("Cancel payment error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to cancel payment",
    });
  }
};

// ==========================================
// GET PAYMENT HISTORY
// ==========================================

export const getPaymentHistory = async (
  req: AuthenticatedRequest,
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

    const payments = await prisma.payment.findMany({
      where: { userId },
      select: {
        id: true,
        planId: true,
        subscriptionId: true,
        invoiceNumber: true,
        razorpayOrderId: true,
        razorpayPaymentId: true,
        amount: true,
        currency: true,
        status: true,
        failureReason: true,
        createdAt: true,
        updatedAt: true,
        plan: {
          select: {
            id: true,
            name: true,
          },
        },
        subscription: {
          select: {
            id: true,
            startDate: true,
            endDate: true,
            isActive: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return res.status(200).json({
      success: true,
      count: payments.length,
      payments,
    });
  } catch (error) {
    console.error("Get payment history error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch payment history",
    });
  }
};

// ==========================================
// GET SINGLE PAYMENT DETAILS
// ==========================================

export const getPaymentDetails = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.userId;
    const paymentId = Number(req.params.paymentId);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    if (!Number.isInteger(paymentId) || paymentId <= 0) {
      return res.status(400).json({
        success: false,
        message: "A valid paymentId is required",
      });
    }

    const payment = await prisma.payment.findFirst({
      where: {
        id: paymentId,
        userId,
      },
      select: {
        id: true,
        userId: true,
        planId: true,
        subscriptionId: true,
        invoiceNumber: true,
        razorpayOrderId: true,
        razorpayPaymentId: true,
        amount: true,
        currency: true,
        status: true,
        failureReason: true,
        createdAt: true,
        updatedAt: true,
        plan: true,
        subscription: true,
      },
    });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    return res.status(200).json({
      success: true,
      payment,
    });
  } catch (error) {
    console.error("Get payment details error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch payment details",
    });
  }
};
