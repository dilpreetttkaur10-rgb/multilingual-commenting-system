import axios from "axios";

const TURNSTILE_VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export const verifyTurnstileToken = async (
  token: string,
  ip?: string
): Promise<boolean> => {
  try {
    if (!token) {
      return false;
    }

    const secretKey = process.env.TURNSTILE_SECRET_KEY;

    if (!secretKey) {
      console.error("TURNSTILE_SECRET_KEY is not configured");
      return false;
    }

    const response = await axios.post(
      TURNSTILE_VERIFY_URL,
      {
        secret: secretKey,
        response: token,
        ...(ip ? { remoteip: ip } : {}),
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 10000,
      }
    );

    return response.data?.success === true;
  } catch (error) {
    console.error("Turnstile verification error:", error);

    return false;
  }
};