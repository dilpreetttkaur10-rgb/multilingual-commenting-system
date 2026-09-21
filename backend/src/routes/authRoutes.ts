import { Router } from "express";
import { register, login } from "../controllers/authController";

import {
  authMiddleware,
  AuthRequest,
} from "../middleware/authMiddleware";

const router = Router();

router.post("/register", register);

router.post("/login", login);

router.get("/protected", authMiddleware, (req: AuthRequest, res) => {


  res.status(200).json({
    success: true,
    message: "You are authenticated",
    user: req.user,
  });
});

export default router;