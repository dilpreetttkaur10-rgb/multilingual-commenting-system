import crypto from "crypto";
import { prisma } from "./prisma";
import { DeviceDetails } from "./deviceDetection";

export const createSession = async (
  userId: number,
  token: string,
  ipAddress: string | null,
  deviceDetails: DeviceDetails
) => {
  const sessionTokenHash = crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");

  const expiresAt = new Date(
    Date.now() + 7 * 24 * 60 * 60 * 1000
  );

  const session = await prisma.userSession.create({
    data: {
      userId,
      sessionTokenHash,
      ipAddress,
      browserName: deviceDetails.browser,
      browserVersion: deviceDetails.browserVersion,
      operatingSystem: deviceDetails.operatingSystem,
      deviceType: deviceDetails.deviceType,
      deviceModel: deviceDetails.deviceModel,
      expiresAt,
    },
  });

  return session;
};

export const getSessionTokenHash = (token: string): string => {
  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
};