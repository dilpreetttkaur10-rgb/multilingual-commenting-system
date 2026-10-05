import Razorpay from "razorpay";

const keyId = process.env.RAZORPAY_KEY_ID;
const keySecret = process.env.RAZORPAY_KEY_SECRET;

export const razorpay = new Razorpay({
  key_id: keyId || "rzp_test_placeholder",
  key_secret: keySecret || "test_secret_placeholder",
});

export const isRazorpayConfigured = Boolean(
  keyId && keySecret
);