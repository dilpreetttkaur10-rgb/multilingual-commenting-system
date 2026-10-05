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

  /*
   * Rename existing plans so old subscriptions remain connected
   * to the same database records.
   */
  const existingBasic = await prisma.subscriptionPlan.findUnique({
    where: {
      name: "BASIC",
    },
  });

  if (existingBasic) {
    await prisma.subscriptionPlan.update({
      where: {
        id: existingBasic.id,
      },
      data: {
        name: "BRONZE",
      },
    });

    console.log("Existing BASIC plan renamed to BRONZE.");
  }

  const existingPremium = await prisma.subscriptionPlan.findUnique({
    where: {
      name: "PREMIUM",
    },
  });

  if (existingPremium) {
    await prisma.subscriptionPlan.update({
      where: {
        id: existingPremium.id,
      },
      data: {
        name: "SILVER",
      },
    });

    console.log("Existing PREMIUM plan renamed to SILVER.");
  }

  const plans = [
    {
      name: "FREE",
      price: 0,
      durationDays: 30,
      downloadLimit: 5,
      maxFileSizeMB: 100,

      premiumVideoAccess: false,
      streamingQuality: "480p",
      watchTimeMinutes: 60,
      offlineDownloads: false,
      adFreeViewing: false,
      priorityContent: false,
      exclusiveCourses: false,
    },

    {
      name: "BRONZE",
      price: 99,
      durationDays: 30,
      downloadLimit: 30,
      maxFileSizeMB: 500,

      premiumVideoAccess: true,
      streamingQuality: "720p",
      watchTimeMinutes: 240,
      offlineDownloads: true,
      adFreeViewing: false,
      priorityContent: false,
      exclusiveCourses: false,
    },

    {
      name: "SILVER",
      price: 199,
      durationDays: 90,
      downloadLimit: 100,
      maxFileSizeMB: 2000,

      premiumVideoAccess: true,
      streamingQuality: "1080p",
      watchTimeMinutes: 480,
      offlineDownloads: true,
      adFreeViewing: true,
      priorityContent: true,
      exclusiveCourses: false,
    },

    {
      name: "GOLD",
      price: 299,
      durationDays: 365,
      downloadLimit: 300,
      maxFileSizeMB: 5000,

      premiumVideoAccess: true,
      streamingQuality: "4K",
      watchTimeMinutes: 0,
      offlineDownloads: true,
      adFreeViewing: true,
      priorityContent: true,
      exclusiveCourses: true,
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

        premiumVideoAccess: plan.premiumVideoAccess,
        streamingQuality: plan.streamingQuality,
        watchTimeMinutes: plan.watchTimeMinutes,
        offlineDownloads: plan.offlineDownloads,
        adFreeViewing: plan.adFreeViewing,
        priorityContent: plan.priorityContent,
        exclusiveCourses: plan.exclusiveCourses,
      },

      create: plan,
    });

    console.log(
      `Plan created/updated: ${result.name} - ₹${result.price}`
    );
  }

  console.log("\nSubscription plans seeded successfully!");
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