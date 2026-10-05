
import { Request, Response } from "express";
import { prisma } from "../utils/prisma";

type AuthenticatedRequest = Request & {
  user?: {
    userId: number;
  };
};

export const getInvoice = async (
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

    let payment = await prisma.payment.findFirst({
      where: {
        id: paymentId,
        userId,
        status: "SUCCESS",
      },
      include: {
        plan: true,
        subscription: true,
      },
    });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Successful payment not found",
      });
    }

    let invoiceNumber = payment.invoiceNumber;

    if (!invoiceNumber) {
      invoiceNumber = `INV-${payment.id.toString().padStart(6, "0")}`;

      payment = await prisma.payment.update({
        where: {
          id: payment.id,
        },
        data: {
          invoiceNumber,
        },
        include: {
          plan: true,
          subscription: true,
        },
      });
    }

    return res.status(200).json({
      success: true,
      invoice: {
        invoiceNumber: payment.invoiceNumber,
        invoiceDate: payment.updatedAt,
        paymentId: payment.id,
        customerId: payment.userId,
        plan: payment.plan.name,
        amount: payment.amount,
        currency: payment.currency,
        paymentStatus: payment.status,
        paymentReference: payment.razorpayPaymentId,
        subscription: payment.subscription
          ? {
              startDate: payment.subscription.startDate,
              endDate: payment.subscription.endDate,
            }
          : null,
      },
    });
  } catch (error) {
    console.error("Get invoice error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to generate invoice",
    });
  }
};
