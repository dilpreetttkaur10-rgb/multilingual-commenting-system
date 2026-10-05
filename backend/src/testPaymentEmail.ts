import { prisma } from "./utils/prisma";
import { sendPaymentConfirmationEmail } from "./services/emailService";

const testPaymentEmail = async () => {
  try {
    const payment = await prisma.payment.findUnique({
      where: { id: 7 },
      include: {
        user: true,
        plan: true,
        subscription: true,
      },
    });

    if (!payment) {
      console.log("Payment 7 not found");
      return;
    }

    if (!payment.invoiceNumber) {
      console.log("Invoice number is missing");
      return;
    }

    if (!payment.user.email) {
      console.log("User email is missing");
      return;
    }

    const result = await sendPaymentConfirmationEmail({
      email: payment.user.email,
      customerName: payment.user.email,
      invoiceNumber: payment.invoiceNumber,
      planName: payment.plan.name,
      amount: payment.amount.toString(),
      currency: payment.currency,
      paymentId: payment.id,
      subscriptionStart: payment.subscription?.startDate ?? null,
      subscriptionEnd: payment.subscription?.endDate ?? null,
    });

    console.log("Email result:", result);
  } catch (error) {
    console.error("Test email error:", error);
  } finally {
    await prisma.$disconnect();
  }
};

testPaymentEmail();