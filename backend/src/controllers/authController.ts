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

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const OTP_EXPIRY_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const TRUSTED_DEVICE_DAYS = 30;
const MIN_PASSWORD_LENGTH = 6;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Used so a "user not found" login takes the same time as a "wrong password"
// login. This stops attackers from discovering which emails are registered.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync("dummy-password-not-real", 10);

type DeviceDetails = ReturnType<typeof detectDevice>;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const getJwtSecret = (): string | null => process.env.JWT_SECRET || null;

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

/**
 * OPTIONAL but recommended: the frontend can create a random ID once,
 * save it in localStorage, and send it in the "x-device-id" header on every
 * request. This makes two identical phones count as two different devices.
 * If the header is missing, everything still works using the user-agent only.
 */
const getClientDeviceId = (req: Request): string => {
  const value = req.get("x-device-id");

  if (typeof value !== "string") return "";

  const trimmed = value.trim();

  return trimmed.length >= 8 && trimmed.length <= 128 ? trimmed : "";
};

const createDeviceFingerprint = (
  userAgent: string,
  details: DeviceDetails,
  clientDeviceId: string
): string => {
  // IP address is NOT included: proxies and mobile networks can change it
  // between login and OTP verification.
  const fingerprintData = [
    userAgent,
    details.browser,
    details.browserVersion,
    details.operatingSystem,
    details.deviceType,
    details.deviceModel || "",
    clientDeviceId,
  ].join("|");

  return crypto.createHash("sha256").update(fingerprintData).digest("hex");
};

const hashOtp = (otp: string, fingerprint: string): string =>
  crypto.createHash("sha256").update(`${otp}:${fingerprint}`).digest("hex");

const toDeviceFields = (details: DeviceDetails) => ({
  browserName: details.browser,
  browserVersion: details.browserVersion,
  operatingSystem: details.operatingSystem,
  deviceType: details.deviceType,
  deviceModel: details.deviceModel,
});

/**
 * Saves a login-history row. A failure to write history must never break
 * the login itself, so errors are only logged.
 */
const recordLogin = async (
  userId: number | null,
  status: string,
  ipAddress: string | null,
  details: DeviceDetails
): Promise<{ id: number } | null> => {
  try {
    const row = await prisma.loginHistory.create({
      data: {
        userId,
        status: status as any,
        ipAddress,
        ...toDeviceFields(details),
      },
    });

    return { id: row.id };
  } catch (error) {
    console.error("Failed to write login history:", error);
    return null;
  }
};

const resolveTheme = async (user: {
  id: number;
  themePreference: ThemePreference;
  themePreferenceMode: "AUTO" | "MANUAL";
}): Promise<ThemePreference> => {
  if (user.themePreferenceMode !== "AUTO") {
    return user.themePreference;
  }

  const themePreference = getAutomaticTheme();

  if (themePreference !== user.themePreference) {
    await prisma.user.update({
      where: { id: user.id },
      data: { themePreference },
    });
  }

  return themePreference;
};

const issueLoginSession = async (
  user: {
    id: number;
    username: string;
    email: string;
    themePreferenceMode: "AUTO" | "MANUAL";
  },
  themePreference: ThemePreference,
  ipAddress: string | null,
  deviceDetails: DeviceDetails
) => {
  const secret = getJwtSecret();

  if (!secret) {
    throw new Error("JWT_SECRET is not configured");
  }

  const token = jwt.sign(
    { userId: user.id, email: user.email },
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

/* -------------------------------------------------------------------------- */
/* Register                                                                   */
/* -------------------------------------------------------------------------- */

export const register = async (req: Request, res: Response) => {
  try {
    const { username, email, password } = req.body ?? {};

    const normalizedEmail =
      typeof email === "string" ? email.trim().toLowerCase() : "";
    const normalizedUsername =
      typeof username === "string" ? username.trim() : "";

    if (
      !normalizedUsername ||
      !normalizedEmail ||
      typeof password !== "string" ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message: "Username, email and password are required",
      });
    }

    if (!EMAIL_REGEX.test(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address",
      });
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({
        success: false,
        message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      });
    }

    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: { equals: normalizedEmail, mode: "insensitive" } },
          { username: { equals: normalizedUsername, mode: "insensitive" } },
        ],
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
        username: normalizedUsername,
        email: normalizedEmail,
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

/* -------------------------------------------------------------------------- */
/* Login                                                                      */
/* -------------------------------------------------------------------------- */

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body ?? {};

    const normalizedEmail =
      typeof email === "string" ? email.trim().toLowerCase() : "";

    if (!normalizedEmail || typeof password !== "string" || !password) {
      console.warn("LOGIN FAIL: missing email or password in request body");

      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const userAgent = req.get("user-agent") || "";
    const ipAddress = req.ip ?? null;
    const deviceDetails = detectDevice(userAgent);

    const user = await prisma.user.findFirst({
      where: { email: { equals: normalizedEmail, mode: "insensitive" } },
    });

    // Always run a bcrypt compare so response time is the same either way.
    const passwordMatches = await bcrypt.compare(
      password,
      user ? user.password : DUMMY_PASSWORD_HASH
    );

    if (!user || !passwordMatches) {
      // These logs show the REAL reason in Render > Logs.
      // The client still only sees one generic message.
      console.warn(
        !user
          ? `LOGIN FAIL: no user found for email "${normalizedEmail}"`
          : `LOGIN FAIL: password mismatch for user id ${user.id}`
      );

      await recordLogin(user ? user.id : null, "FAILED", ipAddress, deviceDetails);

      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const clientDeviceId = getClientDeviceId(req);
    const deviceFingerprint = createDeviceFingerprint(
      userAgent,
      deviceDetails,
      clientDeviceId
    );

    const existingTrustedDevice = await prisma.trustedDevice.findUnique({
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

    /* ------------------------- New / untrusted device ------------------------ */
    if (!isTrusted) {
      const secret = getJwtSecret();

      if (!secret) {
        console.error("LOGIN ERROR: JWT_SECRET is not set");

        return res.status(500).json({
          success: false,
          message: "Authentication configuration error",
        });
      }

      // Cancel any older unused codes so only the newest code works.
      await prisma.otpVerification.updateMany({
        where: { userId: user.id, purpose: "LOGIN", status: "PENDING" },
        data: { status: "EXPIRED" },
      });

      const otp = crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
      const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

      const loginHistory = await prisma.loginHistory.create({
        data: {
          userId: user.id,
          status: "OTP_REQUIRED",
          ipAddress,
          ...toDeviceFields(deviceDetails),
        },
      });

      const otpRecord = await prisma.otpVerification.create({
        data: {
          userId: user.id,
          loginHistoryId: loginHistory.id,
          otpHash: hashOtp(otp, deviceFingerprint),
          purpose: "LOGIN",
          status: "PENDING",
          attempts: 0,
          expiresAt,
        },
      });

      const emailResult = await sendLoginOtpEmail({
        email: user.email,
        otp,
        expiresInMinutes: OTP_EXPIRY_MINUTES,
      });

      if (!emailResult.success) {
        console.error("OTP EMAIL FAILED:", emailResult);

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

    /* ----------------------------- Trusted device ---------------------------- */
    await prisma.trustedDevice.update({
      where: { id: existingTrustedDevice.id },
      data: {
        lastUsedAt: new Date(),
        ipAddress,
        ...toDeviceFields(deviceDetails),
      },
    });

    const themePreference = await resolveTheme(user);

    await recordLogin(user.id, "SUCCESS", ipAddress, deviceDetails);

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

/* -------------------------------------------------------------------------- */
/* Verify OTP                                                                 */
/* -------------------------------------------------------------------------- */

export const verifyLoginOtp = async (req: Request, res: Response) => {
  try {
    const { otp, pendingToken } = req.body ?? {};

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
      console.error("VERIFY ERROR: JWT_SECRET is not set");

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

      claims = decoded;
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
      deviceDetails,
      getClientDeviceId(req)
    );

    if (currentFingerprint !== claims.deviceFingerprint) {
      console.warn("VERIFY FAIL: device fingerprint changed since login");

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

    const storedHashBuffer = Buffer.from(otpRecord.otpHash, "hex");
    const submittedHashBuffer = Buffer.from(
      hashOtp(otp, currentFingerprint),
      "hex"
    );

    const hashesMatch =
      storedHashBuffer.length === submittedHashBuffer.length &&
      crypto.timingSafeEqual(storedHashBuffer, submittedHashBuffer);

    if (!hashesMatch) {
      // Atomic increment, so parallel guesses cannot bypass the limit.
      const updated = await prisma.otpVerification.update({
        where: { id: otpRecord.id },
        data: { attempts: { increment: 1 } },
      });

      const exhausted = updated.attempts >= OTP_MAX_ATTEMPTS;

      if (exhausted) {
        await prisma.otpVerification.update({
          where: { id: otpRecord.id },
          data: { status: "FAILED" },
        });

        if (otpRecord.loginHistoryId) {
          await prisma.loginHistory.update({
            where: { id: otpRecord.loginHistoryId },
            data: { status: "OTP_FAILED" },
          });
        }
      }

      return res.status(exhausted ? 429 : 401).json({
        success: false,
        message: exhausted
          ? "Too many incorrect attempts. Please log in again"
          : "Incorrect OTP",
        attemptsRemaining: Math.max(0, OTP_MAX_ATTEMPTS - updated.attempts),
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

    // Mark the OTP as used. Only one request can succeed here.
    const consumed = await prisma.otpVerification.updateMany({
      where: {
        id: otpRecord.id,
        status: "PENDING",
        attempts: { lt: OTP_MAX_ATTEMPTS },
        expiresAt: { gt: new Date() },
      },
      data: { status: "VERIFIED", verifiedAt: new Date() },
    });

    if (consumed.count !== 1) {
      return res.status(400).json({
        success: false,
        message: "OTP is no longer valid. Please log in again",
      });
    }

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
        ...toDeviceFields(deviceDetails),
        ipAddress,
        trustedUntil,
        lastUsedAt: new Date(),
        revokedAt: null,
      },
      create: {
        userId: user.id,
        deviceFingerprint: currentFingerprint,
        ...toDeviceFields(deviceDetails),
        ipAddress,
        trustedUntil,
        lastUsedAt: new Date(),
      },
    });

    const themePreference = await resolveTheme(user);

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

/* -------------------------------------------------------------------------- */
/* Theme                                                                      */
/* -------------------------------------------------------------------------- */

export const updateThemePreference = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const { mode, theme } = req.body ?? {};
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

    if (mode === "MANUAL" && theme !== "LIGHT" && theme !== "DARK") {
      return res.status(400).json({
        success: false,
        message: "Theme must be LIGHT or DARK in manual mode",
      });
    }

    const themePreference =
      mode === "AUTO" ? getAutomaticTheme() : (theme as ThemePreference);

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { themePreferenceMode: mode, themePreference },
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

/* -------------------------------------------------------------------------- */
/* Login history                                                              */
/* -------------------------------------------------------------------------- */

export const getLoginHistory = async (req: AuthRequest, res: Response) => {
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
      take: 100,
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

/* -------------------------------------------------------------------------- */
/* Logout                                                                     */
/* -------------------------------------------------------------------------- */

export const logout = async (req: AuthRequest, res: Response) => {
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
      where: { userId, sessionTokenHash, revokedAt: null },
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