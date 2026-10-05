import { Router } from "express";
import { getInvoice } from "../controllers/invoiceController";
import { authMiddleware } from "../middleware/authMiddleware";

const router = Router();

router.get("/:paymentId", authMiddleware, getInvoice);

export default router;