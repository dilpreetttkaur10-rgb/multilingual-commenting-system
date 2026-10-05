-- AlterTable
ALTER TABLE "SubscriptionPlan" ADD COLUMN     "adFreeViewing" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "exclusiveCourses" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "offlineDownloads" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "premiumVideoAccess" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "priorityContent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "streamingQuality" TEXT NOT NULL DEFAULT 'LOW',
ADD COLUMN     "watchTimeMinutes" INTEGER NOT NULL DEFAULT 60;
