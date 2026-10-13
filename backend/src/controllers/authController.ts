
import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { ThemePreference } from "@prisma/client";
import { prisma } from "../utils/prisma";
import { AuthRequest } from "../middleware/authMiddleware";
import { detectDevice } from "../utils/deviceDetection";
import {
  createSession,
  getSessionTokenHash,
} from "../utils/sessionManager";
import { sendLoginOtpEmail } from "../services/emailService";

const OTP_EXPIRY_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const TRUSTED_DEVICE_DAYS = 30;

const getAutomaticTheme = (): ThemePreference => {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(new Date())
  );

  return hour >= 5 && hour < 12 ? "LIGHT" : "DARK";
};

const createDeviceFingerprint = (
  userAgent: string,
  ipAddress: string,
  browser: string,
  browserVersion: string,
  operatingSystem: string,
  deviceType: string,
  deviceModel: string | null
): string => {
  const fingerprintData = [
    userAgent,
    ipAddress,
    browser,
    browserVersion,
    operatingSystem,
    deviceType,
    deviceModel || "",
  ].join("|");

  return crypto
    .createHash("sha256")
    .update(fingerprintData)
    .digest("hex");
};

const getJwtSecret = (): string | null => {
  return process.env.JWT_SECRET || null;
};

// Creates an authenticated JWT and its corresponding database session.
const issueLoginSession = async (
  user: {
    id: number;
    username: string;
    email: string;
    themePreference: ThemePreference;
    themePreferenceMode: "AUTO" | "MANUAL";
  },
  themePreference: ThemePreference,
  ipAddress: string | null,
  deviceDetails: ReturnType<typeof detectDevice>
) => {
  const secret = getJwtSecret();

  if (!secret) {
    throw new Error("JWT_SECRET is not configured");
  }

  const token = jwt.sign(
    {
      userId: user.id,
      email: user.email,
    },
    secret,
    { expiresIn: "7d" }
  );

  await createSession(user.id, token, ipAddress, deviceDetails);

  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      themePreference,
      themePreferenceMode: user.themePreferenceMode,
    },
  };
};

export const register = async (req: Request, res: Response) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Username, email and password are required",
      });
    }

    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email }, { username }],
      },
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "Username or email already exists",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        username,
        email,
        password: hashedPassword,
        themePreference: "DARK",
        themePreferenceMode: "AUTO",
      },
    });

    const freePlan = await prisma.subscriptionPlan.findFirst({
      where: { name: "FREE" },
    });

    if (freePlan) {
      await prisma.userSubscription.create({
        data: {
          userId: user.id,
          planId: freePlan.id,
          startDate: new Date(),
          endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });
    }

    return res.status(201).json({
      success: true,
      message: "Registration successful",
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        themePreference: user.themePreference,
        themePreferenceMode: user.themePreferenceMode,
      },
    });
  } catch (error) {
    console.error("Registration error:", error);

    return res.status(500).json({
      success: false,
      message: "Registration failed",
    });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const userAgent = req.get("user-agent") || "";
    const ipAddress = req.ip ?? null;
    const deviceDetails = detectDevice(userAgent);

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      await prisma.loginHistory.create({
        data: {
          userId: null,
          status: "FAILED",
          ipAddress,
          browserName: deviceDetails.browser,
          browserVersion: deviceDetails.browserVersion,
          operatingSystem: deviceDetails.operatingSystem,
          deviceType: deviceDetails.deviceType,
          deviceModel: deviceDetails.deviceModel,
        },
      });

      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const passwordMatches = await bcrypt.compare(
      password,
      user.password
    );

    if (!passwordMatches) {
      await prisma.loginHistory.create({
        data: {
          userId: user.id,
          status: "FAILED",
          ipAddress,
          browserName: deviceDetails.browser,
          browserVersion: deviceDetails.browserVersion,
          operatingSystem: deviceDetails.operatingSystem,
          deviceType: deviceDetails.deviceType,
          deviceModel: deviceDetails.deviceModel,
        },
      });

      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const deviceFingerprint = createDeviceFingerprint(
      userAgent,
      ipAddress || "",
      deviceDetails.browser,
      deviceDetails.browserVersion,
      deviceDetails.operatingSystem,
      deviceDetails.deviceType,
      deviceDetails.deviceModel
    );

    const existingTrustedDevice =
      await prisma.trustedDevice.findUnique({
        where: {
          userId_deviceFingerprint: {
            userId: user.id,
            deviceFingerprint,
          },
        },
      });

    const isTrusted =
      !!existingTrustedDevice &&
      !existingTrustedDevice.revokedAt &&
      existingTrustedDevice.trustedUntil > new Date();

    // Untrusted devices must complete OTP verification first.
    if (!isTrusted) {
      const secret = getJwtSecret();

      if (!secret) {
        return res.status(500).json({
          success: false,
          message: "Authentication configuration error",
        });
      }

      const otp = crypto
        .randomInt(0, 1_000_000)
        .toString()
        .padStart(6, "0");

      const expiresAt = new Date(
        Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000
      );

      const otpHash = crypto
        .createHash("sha256")
        .update(`${otp}:${deviceFingerprint}`)
        .digest("hex");

      const loginHistory = await prisma.loginHistory.create({
        data: {
          userId: user.id,
          status: "OTP_REQUIRED",
          ipAddress,
          browserName: deviceDetails.browser,
          browserVersion: deviceDetails.browserVersion,
          operatingSystem: deviceDetails.operatingSystem,
          deviceType: deviceDetails.deviceType,
          deviceModel: deviceDetails.deviceModel,
        },
      });

      const otpRecord = await prisma.otpVerification.create({
        data: {
          userId: user.id,
          loginHistoryId: loginHistory.id,
          otpHash,
          purpose: "LOGIN",
          status: "PENDING",
          attempts: 0,
          expiresAt,
        },
      });

      // No trusted device, authenticated JWT, or session is created here.
      const emailResult = await sendLoginOtpEmail({
        email: user.email,
        otp,
        expiresInMinutes: OTP_EXPIRY_MINUTES,
      });

      if (!emailResult.success) {
        await prisma.otpVerification.update({
          where: { id: otpRecord.id },
          data: { status: "FAILED" },
        });

        await prisma.loginHistory.update({
          where: { id: loginHistory.id },
          data: { status: "OTP_FAILED" },
        });

        return res.status(503).json({
          success: false,
          message: "Unable to deliver login verification code",
        });
      }

      // This is a short-lived verification token, not an auth session.
      const pendingToken = jwt.sign(
        {
          purpose: "LOGIN_OTP",
          userId: user.id,
          otpId: otpRecord.id,
          deviceFingerprint,
        },
        secret,
        { expiresIn: `${OTP_EXPIRY_MINUTES}m` }
      );

      return res.status(202).json({
        success: true,
        verificationRequired: true,
        message: "Verify the OTP to complete login",
        pendingToken,
        expiresInMinutes: OTP_EXPIRY_MINUTES,
      });
    }

    // Trusted device: continue with normal login.
    await prisma.trustedDevice.update({
      where: { id: existingTrustedDevice.id },
      data: {
        lastUsedAt: new Date(),
        ipAddress,
        browserName: deviceDetails.browser,
        browserVersion: deviceDetails.browserVersion,
        operatingSystem: deviceDetails.operatingSystem,
        deviceType: deviceDetails.deviceType,
        deviceModel: deviceDetails.deviceModel,
      },
    });

    let themePreference = user.themePreference;

    if (user.themePreferenceMode === "AUTO") {
      themePreference = getAutomaticTheme();

      await prisma.user.update({
        where: { id: user.id },
        data: { themePreference },
      });
    }

    await prisma.loginHistory.create({
      data: {
        userId: user.id,
        status: "SUCCESS",
        ipAddress,
        browserName: deviceDetails.browser,
        browserVersion: deviceDetails.browserVersion,
        operatingSystem: deviceDetails.operatingSystem,
        deviceType: deviceDetails.deviceType,
        deviceModel: deviceDetails.deviceModel,
      },
    });

    const sessionData = await issueLoginSession(
      user,
      themePreference,
      ipAddress,
      deviceDetails
    );

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token: sessionData.token,
      isNewDevice: false,
      user: sessionData.user,
    });
  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      success: false,
      message: "Login failed",
    });
  }
};

export const verifyLoginOtp = async (
  req: Request,
  res: Response
) => {
  try {
    const { otp, pendingToken } = req.body;

    if (
      typeof otp !== "string" ||
      !/^\d{6}$/.test(otp) ||
      typeof pendingToken !== "string" ||
      !pendingToken
    ) {
      return res.status(400).json({
        success: false,
        message: "A six-digit OTP and pending token are required",
      });
    }

    const secret = getJwtSecret();

    if (!secret) {
      return res.status(500).json({
        success: false,
        message: "Authentication configuration error",
      });
    }

    let claims: jwt.JwtPayload;

    try {
      const decoded = jwt.verify(pendingToken, secret);

      if (typeof decoded === "string") {
        throw new Error("Invalid verification token");
      }

      claims = decoded as jwt.JwtPayload;
    } catch {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired verification token",
      });
    }

    if (
      claims.purpose !== "LOGIN_OTP" ||
      typeof claims.userId !== "number" ||
      typeof claims.otpId !== "number" ||
      typeof claims.deviceFingerprint !== "string"
    ) {
      return res.status(401).json({
        success: false,
        message: "Invalid verification token",
      });
    }

    const userAgent = req.get("user-agent") || "";
    const ipAddress = req.ip ?? null;
    const deviceDetails = detectDevice(userAgent);

    const currentFingerprint = createDeviceFingerprint(
      userAgent,
      ipAddress || "",
      deviceDetails.browser,
      deviceDetails.browserVersion,
      deviceDetails.operatingSystem,
      deviceDetails.deviceType,
      deviceDetails.deviceModel
    );

    if (currentFingerprint !== claims.deviceFingerprint) {
      return res.status(401).json({
        success: false,
        message: "Verification must be completed on the same device",
      });
    }

    const otpRecord = await prisma.otpVerification.findUnique({
      where: { id: claims.otpId },
    });

    if (
      !otpRecord ||
      otpRecord.userId !== claims.userId ||
      otpRecord.purpose !== "LOGIN"
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid verification request",
      });
    }

    if (otpRecord.status !== "PENDING") {
      return res.status(400).json({
        success: false,
        message: "This OTP has already been used or invalidated",
      });
    }

    if (otpRecord.expiresAt <= new Date()) {
      await prisma.otpVerification.update({
        where: { id: otpRecord.id },
        data: { status: "EXPIRED" },
      });

      if (otpRecord.loginHistoryId) {
        await prisma.loginHistory.update({
          where: { id: otpRecord.loginHistoryId },
          data: { status: "OTP_FAILED" },
        });
      }

      return res.status(400).json({
        success: false,
        message: "OTP has expired. Please log in again",
      });
    }

    if (otpRecord.attempts >= OTP_MAX_ATTEMPTS) {
      await prisma.otpVerification.update({
        where: { id: otpRecord.id },
        data: { status: "FAILED" },
      });

      return res.status(429).json({
        success: false,
        message: "Too many incorrect attempts. Please log in again",
      });
    }

    const submittedHash = crypto
      .createHash("sha256")
      .update(`${otp}:${currentFingerprint}`)
      .digest("hex");

    const storedHashBuffer = Buffer.from(otpRecord.otpHash, "hex");
    const submittedHashBuffer = Buffer.from(submittedHash, "hex");

    const hashesMatch =
      storedHashBuffer.length === submittedHashBuffer.length &&
      crypto.timingSafeEqual(storedHashBuffer, submittedHashBuffer);

    if (!hashesMatch) {
      const newAttempts = otpRecord.attempts + 1;
      const exhausted = newAttempts >= OTP_MAX_ATTEMPTS;

      await prisma.otpVerification.update({
        where: { id: otpRecord.id },
        data: {
          attempts: newAttempts,
          ...(exhausted ? { status: "FAILED" as const } : {}),
        },
      });

      if (exhausted && otpRecord.loginHistoryId) {
        await prisma.loginHistory.update({
          where: { id: otpRecord.loginHistoryId },
          data: { status: "OTP_FAILED" },
        });
      }

      return res.status(exhausted ? 429 : 401).json({
        success: false,
        message: exhausted
          ? "Too many incorrect attempts. Please log in again"
          : "Incorrect OTP",
        attemptsRemaining: Math.max(0, OTP_MAX_ATTEMPTS - newAttempts),
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: otpRecord.userId },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User account not found",
      });
    }

    // Consume the OTP only if it is still pending and unexpired.
    const consumed = await prisma.otpVerification.updateMany({
      where: {
        id: otpRecord.id,
        status: "PENDING",
        attempts: { lt: OTP_MAX_ATTEMPTS },
        expiresAt: { gt: new Date() },
      },
      data: {
        status: "VERIFIED",
        verifiedAt: new Date(),
      },
    });

    if (consumed.count !== 1) {
      return res.status(400).json({
        success: false,
        message: "OTP is no longer valid. Please log in again",
      });
    }

    // Trust the device only after successful OTP verification.
    const trustedUntil = new Date(
      Date.now() + TRUSTED_DEVICE_DAYS * 24 * 60 * 60 * 1000
    );

    await prisma.trustedDevice.upsert({
      where: {
        userId_deviceFingerprint: {
          userId: user.id,
          deviceFingerprint: currentFingerprint,
        },
      },
      update: {
        browserName: deviceDetails.browser,
        browserVersion: deviceDetails.browserVersion,
        operatingSystem: deviceDetails.operatingSystem,
        deviceType: deviceDetails.deviceType,
        deviceModel: deviceDetails.deviceModel,
        ipAddress,
        trustedUntil,
        lastUsedAt: new Date(),
        revokedAt: null,
      },
      create: {
        userId: user.id,
        deviceFingerprint: currentFingerprint,
        browserName: deviceDetails.browser,
        browserVersion: deviceDetails.browserVersion,
        operatingSystem: deviceDetails.operatingSystem,
        deviceType: deviceDetails.deviceType,
        deviceModel: deviceDetails.deviceModel,
        ipAddress,
        trustedUntil,
        lastUsedAt: new Date(),
      },
    });

    let themePreference = user.themePreference;

    if (user.themePreferenceMode === "AUTO") {
      themePreference = getAutomaticTheme();

      await prisma.user.update({
        where: { id: user.id },
        data: { themePreference },
      });
    }

    if (otpRecord.loginHistoryId) {
      await prisma.loginHistory.update({
        where: { id: otpRecord.loginHistoryId },
        data: { status: "OTP_VERIFIED" },
      });
    }

    const sessionData = await issueLoginSession(
      user,
      themePreference,
      ipAddress,
      deviceDetails
    );

    return res.status(200).json({
      success: true,
      message: "OTP verified. Login successful",
      token: sessionData.token,
      isNewDevice: true,
      user: sessionData.user,
    });
  } catch (error) {
    console.error("OTP verification error:", error);

    return res.status(500).json({
      success: false,
      message: "OTP verification failed",
    });
  }
};

export const updateThemePreference = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const { mode, theme } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    if (mode !== "AUTO" && mode !== "MANUAL") {
      return res.status(400).json({
        success: false,
        message: "Mode must be AUTO or MANUAL",
      });
    }

    if (
      mode === "MANUAL" &&
      theme !== "LIGHT" &&
      theme !== "DARK"
    ) {
      return res.status(400).json({
        success: false,
        message: "Theme must be LIGHT or DARK in manual mode",
      });
    }

    const themePreference =
      mode === "AUTO"
        ? getAutomaticTheme()
        : (theme as ThemePreference);

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        themePreferenceMode: mode,
        themePreference,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Theme preference updated successfully",
      themePreference: updatedUser.themePreference,
      themePreferenceMode: updatedUser.themePreferenceMode,
    });
  } catch (error) {
    console.error("Theme update error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update theme preference",
    });
  }
};

export const getLoginHistory = async (
  req: AuthRequest,
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

    const history = await prisma.loginHistory.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        ipAddress: true,
        browserName: true,
        browserVersion: true,
        operatingSystem: true,
        deviceType: true,
        deviceModel: true,
        createdAt: true,
      },
    });

    return res.status(200).json({
      success: true,
      count: history.length,
      history,
    });
  } catch (error) {
    console.error("Get login history error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve login history",
    });
  }
};

export const logout = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const userId = req.user?.userId;
    const authHeader = req.headers.authorization;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Authentication token required",
      });
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Authentication token required",
      });
    }

    const sessionTokenHash = getSessionTokenHash(token);

    const session = await prisma.userSession.findFirst({
      where: {
        userId,
        sessionTokenHash,
        revokedAt: null,
      },
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Active session not found",
      });
    }

    await prisma.userSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

    return res.status(200).json({
      success: true,
      message: "Logout successful",
    });
  } catch (error) {
    console.error("Logout error:", error);

    return res.status(500).json({
      success: false,
      message: "Logout failed",
    });
  }
};
