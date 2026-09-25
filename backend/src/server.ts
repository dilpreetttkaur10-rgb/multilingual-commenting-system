import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import authRoutes from "./routes/authRoutes";
import commentRoutes from "./routes/commentRoutes";
import reportRoutes from "./routes/reportRoutes";
import downloadRoutes from "./routes/downloadRoutes";
import subscriptionRoutes from "./routes/subscriptionRoutes";

dotenv.config();

const app = express();

const PORT = process.env.PORT || 5000;

// ==========================================
// MIDDLEWARE
// ==========================================

app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  })
);

app.use(express.json());

// ==========================================
// ROUTES
// ==========================================

app.use("/api/auth", authRoutes);

app.use("/api/comments", commentRoutes);

app.use("/api/reports", reportRoutes);

app.use("/api/downloads", downloadRoutes);

app.use("/api/subscriptions", subscriptionRoutes);

// ==========================================
// ROOT ROUTE
// ==========================================

app.get("/", (_req, res) => {
  res.json({
    success: true,
    message: "Multilingual Commenting System API",
  });
});

// ==========================================
// HEALTH CHECK
// ==========================================

app.get("/api/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "API is working",
  });
});

// ==========================================
// START SERVER
// ==========================================

app.listen(PORT, () => {
  console.log(
    `Backend running on http://localhost:${PORT}`
  );
});