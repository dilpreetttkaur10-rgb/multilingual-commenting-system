require("dotenv").config();

const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({
  adapter,
});

async function main() {
  console.log("Starting subscription plan seed...");

  const plans = [
    {
      name: "FREE",
      price: 0,
      durationDays: 30,
      downloadLimit: 5,
      maxFileSizeMB: 100,
    },
    {
      name: "BASIC",
      price: 99,
      durationDays: 30,
      downloadLimit: 30,
      maxFileSizeMB: 500,
    },
    {
      name: "PREMIUM",
      price: 199,
      durationDays: 30,
      downloadLimit: 100,
      maxFileSizeMB: 2000,
    },
  ];

  for (const plan of plans) {
    const result = await prisma.subscriptionPlan.upsert({
      where: {
        name: plan.name,
      },
      update: {
        price: plan.price,
        durationDays: plan.durationDays,
        downloadLimit: plan.downloadLimit,
        maxFileSizeMB: plan.maxFileSizeMB,
      },
      create: plan,
    });

    console.log(
      `Plan created/updated: ${result.name} - ₹${result.price}`
    );
  }

  console.log("Subscription plans seeded successfully!");
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });