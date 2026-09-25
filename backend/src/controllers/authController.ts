import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../utils/prisma";

export const register = async (req: Request, res: Response) => {
  try {
    const { username, email, password, location, avatarUrl } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Username, email and password are required",
      });
    }

    const existingUser = await prisma.user.findUnique({
      where: {
        email,
      },
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "Email already registered",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          username,
          email,
          password: hashedPassword,
          location,
          avatarUrl,
        },
      });

      const freePlan = await tx.subscriptionPlan.findUnique({
        where: {
          name: "FREE",
        },
      });

      if (!freePlan) {
        throw new Error("FREE subscription plan not found");
      }

      const endDate = new Date();
      endDate.setDate(endDate.getDate() + freePlan.durationDays);

      const subscription = await tx.userSubscription.create({
        data: {
          userId: user.id,
          planId: freePlan.id,
          startDate: new Date(),
          endDate,
          isActive: true,
          downloadsUsed: 0,
        },
      });

      return {
        user,
        subscription,
        plan: freePlan,
      };
    });

    return res.status(201).json({
      success: true,
      message: "User registered successfully",
      user: {
        id: result.user.id,
        username: result.user.username,
        email: result.user.email,
        location: result.user.location,
        avatarUrl: result.user.avatarUrl,
      },
      subscription: {
        id: result.subscription.id,
        plan: result.plan.name,
        price: result.plan.price,
        startDate: result.subscription.startDate,
        endDate: result.subscription.endDate,
        downloadsLimit: result.plan.downloadLimit,
        downloadsUsed: result.subscription.downloadsUsed,
        maxFileSizeMB: result.plan.maxFileSizeMB,
      },
    });
  } catch (error) {
    console.error("Register error:", error);

    return res.status(500).json({
      success: false,
      message: "Something went wrong",
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

    const user = await prisma.user.findUnique({
      where: {
        email,
      },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const isPasswordValid = await bcrypt.compare(
      password,
      user.password
    );

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
      },
      process.env.JWT_SECRET!,
      {
        expiresIn: "7d",
      }
    );

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        location: user.location,
        avatarUrl: user.avatarUrl,
      },
    });
  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      success: false,
      message: "Something went wrong",
    });
  }
};