
import { prisma } from "./src/utils/prisma";

async function main() {
  const payment = await prisma.payment.findUnique({
    where: {
      id: 1,
    },
    select: {
      id: true,
      userId: true,
      planId: true,
      razorpayOrderId: true,
      razorpayPaymentId: true,
      status: true,
      amount: true,
      currency: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  console.log("Payment record:");
  console.log(JSON.stringify(payment, null, 2));
}

main()
  .catch((error) => {
    console.error("Database check failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
