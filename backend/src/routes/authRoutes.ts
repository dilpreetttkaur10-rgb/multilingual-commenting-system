
import { Router } from "express";

import {
  register,
  login,
  verifyLoginOtp,
  updateThemePreference,
  getLoginHistory,
  logout,
} from "../controllers/authController";

import {
  getActiveSessions,
  getSessionDetails,
  revokeSession,
  revokeOtherSessions,
} from "../controllers/sessionController";

import {
  authMiddleware,
  AuthRequest,
} from "../middleware/authMiddleware";

const router = Router();

// Register
router.post("/register", register);

// Login
router.post("/login", login);

// Verify OTP for new or untrusted device.
// This route is public because the user has not logged in yet.
router.post("/verify-login-otp", verifyLoginOtp);

// Update theme preference
router.patch(
  "/theme",
  authMiddleware,
  updateThemePreference
);

// Get login history
router.get(
  "/login-history",
  authMiddleware,
  getLoginHistory
);

// Get all active sessions
router.get(
  "/sessions",
  authMiddleware,
  getActiveSessions
);

// Get details of a specific session
router.get(
  "/sessions/:id",
  authMiddleware,
  getSessionDetails
);

// Revoke a specific session
router.delete(
  "/sessions/:id",
  authMiddleware,
  revokeSession
);

// Logout current session
router.post(
  "/logout",
  authMiddleware,
  logout
);

// Logout all other sessions
router.post(
  "/logout-other-sessions",
  authMiddleware,
  revokeOtherSessions
);

// Protected test route
router.get(
  "/protected",
  authMiddleware,
  (req: AuthRequest, res) => {
    res.status(200).json({
      success: true,
      message: "You are authenticated",
      user: req.user,
    });
  }
);

export default router;
