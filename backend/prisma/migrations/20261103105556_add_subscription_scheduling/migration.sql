-- AlterTable
ALTER TABLE "UserSubscription" ADD COLUMN     "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "scheduledPlanId" INTEGER;

-- CreateIndex
CREATE INDEX "UserSubscription_scheduledPlanId_idx" ON "UserSubscription"("scheduledPlanId");

-- AddForeignKey
ALTER TABLE "UserSubscription" ADD CONSTRAINT "UserSubscription_scheduledPlanId_fkey" FOREIGN KEY ("scheduledPlanId") REFERENCES "SubscriptionPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
