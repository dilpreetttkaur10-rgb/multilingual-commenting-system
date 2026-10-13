/*
  Day 31 - Login Security Migration

  This migration adds:
  - Theme preferences
  - Phone number
  - Login history
  - OTP verification
  - Trusted devices
  - User sessions

  Existing User rows are handled safely for updatedAt.
*/

-- CreateEnum
CREATE TYPE "ThemePreference" AS ENUM ('LIGHT', 'DARK');

-- CreateEnum
CREATE TYPE "ThemePreferenceMode" AS ENUM ('AUTO', 'MANUAL');

-- CreateEnum
CREATE TYPE "DeviceType" AS ENUM ('DESKTOP', 'MOBILE', 'TABLET', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "LoginStatus" AS ENUM (
    'SUCCESS',
    'FAILED',
    'OTP_REQUIRED',
    'OTP_FAILED',
    'OTP_VERIFIED'
);

-- CreateEnum
CREATE TYPE "OtpStatus" AS ENUM (
    'PENDING',
    'VERIFIED',
    'FAILED',
    'EXPIRED'
);

-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('LOGIN');


-- ==========================================
-- USER TABLE CHANGES
-- ==========================================

ALTER TABLE "User"
ADD COLUMN "phoneNumber" TEXT,
ADD COLUMN "themePreference" "ThemePreference" NOT NULL DEFAULT 'DARK',
ADD COLUMN "themePreferenceMode" "ThemePreferenceMode" NOT NULL DEFAULT 'AUTO';


-- Add updatedAt temporarily with a default
ALTER TABLE "User"
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;


-- Existing users now have a valid updatedAt value.
-- Remove the database-level default because Prisma
-- manages this field through @updatedAt.
ALTER TABLE "User"
ALTER COLUMN "updatedAt" DROP DEFAULT;


-- ==========================================
-- LOGIN HISTORY
-- ==========================================

CREATE TABLE "LoginHistory" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "status" "LoginStatus" NOT NULL DEFAULT 'FAILED',
    "ipAddress" TEXT,
    "browserName" TEXT,
    "browserVersion" TEXT,
    "operatingSystem" TEXT,
    "deviceType" "DeviceType" NOT NULL,
    "deviceModel" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "loginAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginHistory_pkey" PRIMARY KEY ("id")
);


-- ==========================================
-- OTP VERIFICATION
-- ==========================================

CREATE TABLE "OtpVerification" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "loginHistoryId" INTEGER,
    "otpHash" TEXT NOT NULL,
    "purpose" "OtpPurpose" NOT NULL DEFAULT 'LOGIN',
    "status" "OtpStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpVerification_pkey" PRIMARY KEY ("id")
);


-- ==========================================
-- TRUSTED DEVICES
-- ==========================================

CREATE TABLE "TrustedDevice" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "deviceFingerprint" TEXT NOT NULL,
    "browserName" TEXT,
    "browserVersion" TEXT,
    "operatingSystem" TEXT,
    "deviceType" "DeviceType" NOT NULL,
    "deviceModel" TEXT,
    "ipAddress" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT,
    "trustedUntil" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "TrustedDevice_pkey" PRIMARY KEY ("id")
);


-- ==========================================
-- USER SESSIONS
-- ==========================================

CREATE TABLE "UserSession" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "sessionTokenHash" TEXT NOT NULL,
    "ipAddress" TEXT,
    "browserName" TEXT,
    "browserVersion" TEXT,
    "operatingSystem" TEXT,
    "deviceType" "DeviceType" NOT NULL,
    "deviceModel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);


-- ==========================================
-- INDEXES
-- ==========================================

CREATE INDEX "LoginHistory_userId_idx"
ON "LoginHistory"("userId");

CREATE INDEX "LoginHistory_ipAddress_idx"
ON "LoginHistory"("ipAddress");

CREATE INDEX "LoginHistory_loginAt_idx"
ON "LoginHistory"("loginAt");

CREATE INDEX "LoginHistory_status_idx"
ON "LoginHistory"("status");


CREATE INDEX "OtpVerification_userId_idx"
ON "OtpVerification"("userId");

CREATE INDEX "OtpVerification_loginHistoryId_idx"
ON "OtpVerification"("loginHistoryId");

CREATE INDEX "OtpVerification_status_idx"
ON "OtpVerification"("status");

CREATE INDEX "OtpVerification_expiresAt_idx"
ON "OtpVerification"("expiresAt");


CREATE INDEX "TrustedDevice_userId_idx"
ON "TrustedDevice"("userId");

CREATE INDEX "TrustedDevice_trustedUntil_idx"
ON "TrustedDevice"("trustedUntil");

CREATE INDEX "TrustedDevice_revokedAt_idx"
ON "TrustedDevice"("revokedAt");

CREATE UNIQUE INDEX "TrustedDevice_userId_deviceFingerprint_key"
ON "TrustedDevice"("userId", "deviceFingerprint");


CREATE UNIQUE INDEX "UserSession_sessionTokenHash_key"
ON "UserSession"("sessionTokenHash");

CREATE INDEX "UserSession_userId_idx"
ON "UserSession"("userId");

CREATE INDEX "UserSession_expiresAt_idx"
ON "UserSession"("expiresAt");

CREATE INDEX "UserSession_revokedAt_idx"
ON "UserSession"("revokedAt");


-- ==========================================
-- FOREIGN KEYS
-- ==========================================

ALTER TABLE "LoginHistory"
ADD CONSTRAINT "LoginHistory_userId_fkey"
FOREIGN KEY ("userId")
REFERENCES "User"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;


ALTER TABLE "OtpVerification"
ADD CONSTRAINT "OtpVerification_userId_fkey"
FOREIGN KEY ("userId")
REFERENCES "User"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;


ALTER TABLE "OtpVerification"
ADD CONSTRAINT "OtpVerification_loginHistoryId_fkey"
FOREIGN KEY ("loginHistoryId")
REFERENCES "LoginHistory"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;


ALTER TABLE "TrustedDevice"
ADD CONSTRAINT "TrustedDevice_userId_fkey"
FOREIGN KEY ("userId")
REFERENCES "User"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;


ALTER TABLE "UserSession"
ADD CONSTRAINT "UserSession_userId_fkey"
FOREIGN KEY ("userId")
REFERENCES "User"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;