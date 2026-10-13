
import nodemailer from "nodemailer";

// Send OTP using mock delivery in development,
// or real SMTP when explicitly configured.
export const sendLoginOtpEmail = async (data: {
  email: string;
  otp: string;
  expiresInMinutes: number;
}) => {
  try {
    // Mock OTP delivery for local development only.
    if (
      process.env.NODE_ENV !== "production" &&
      process.env.MOCK_OTP_EMAIL === "true"
    ) {
      console.log("\n========== MOCK LOGIN OTP ==========");
      console.log(`Test email: ${data.email}`);
      console.log(`OTP: ${data.otp}`);
      console.log(`Expires in: ${data.expiresInMinutes} minutes`);
      console.log("====================================\n");

      return { success: true, mock: true };
    }

    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || 587);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const from = process.env.SMTP_FROM || user;

    if (!host || !user || !pass || !from) {
      console.error("OTP email configuration is missing.");
      return {
        success: false,
        message: "Email service is not configured.",
      };
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: process.env.SMTP_SECURE === "true" || port === 465,
      auth: { user, pass },
    });

    await transporter.sendMail({
      from,
      to: data.email,
      subject: "Your login verification code",
      text:
        `Your login verification code is ${data.otp}.\n` +
        `It expires in ${data.expiresInMinutes} minutes.\n` +
        "If you did not attempt to log in, ignore this email.",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px;">
          <h2>Login verification</h2>
          <p>We detected a login from a new or untrusted device.</p>
          <p>Your verification code is:</p>
          <p style="font-size: 28px; font-weight: bold;
                    letter-spacing: 8px;">${data.otp}</p>
          <p>This code expires in ${data.expiresInMinutes} minutes.</p>
          <p>If you did not attempt to log in, ignore this email.</p>
        </div>
      `,
    });

    return { success: true, mock: false };
  } catch (error) {
    console.error("OTP email sending failed:", error);
    return {
      success: false,
      message: "Unable to send the verification email.",
    };
  }
};

// Existing payment confirmation email — preserved.
export const sendPaymentConfirmationEmail = async (data: {
  email: string;
  customerName: string;
  invoiceNumber: string;
  planName: string;
  amount: string;
  currency: string;
  paymentId: number;
  subscriptionStart: Date | null;
  subscriptionEnd: Date | null;
}) => {
  try {
    const testAccount = await nodemailer.createTestAccount();

    const transporter = nodemailer.createTransport({
      host: "smtp.ethereal.email",
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });

    const info = await transporter.sendMail({
      from: '"Subscription Platform" <no-reply@example.com>',
      to: data.email,
      subject: "Payment Confirmation and Invoice",
      html: `
        <h2>Payment Successful!</h2>
        <p>Hello ${data.customerName},</p>
        <p>Your subscription payment was successful.</p>
        <h3>Invoice Details</h3>
        <p><strong>Invoice Number:</strong> ${data.invoiceNumber}</p>
        <p><strong>Payment ID:</strong> ${data.paymentId}</p>
        <p><strong>Plan:</strong> ${data.planName}</p>
        <p><strong>Amount:</strong> ${data.currency} ${data.amount}</p>
        <h3>Subscription Details</h3>
        <p><strong>Start Date:</strong> ${
          data.subscriptionStart?.toDateString() ?? "N/A"
        }</p>
        <p><strong>End Date:</strong> ${
          data.subscriptionEnd?.toDateString() ?? "N/A"
        }</p>
        <p>For support, contact support@example.com.</p>
      `,
    });

    const previewUrl = nodemailer.getTestMessageUrl(info) || null;
    console.log("Email preview:", previewUrl);

    return { success: true, previewUrl };
  } catch (error) {
    console.error("Email sending failed:", error);
    return { success: false, previewUrl: null };
  }
};
