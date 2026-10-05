
import nodemailer from "nodemailer";

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

    return {
      success: true,
      previewUrl,
    };
  } catch (error) {
    console.error("Email sending failed:", error);

    return {
      success: false,
      previewUrl: null,
    };
  }
};
