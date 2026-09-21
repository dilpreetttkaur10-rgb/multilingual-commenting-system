"use client";

import { Turnstile } from "@marsidev/react-turnstile";

interface TurnstileCaptchaProps {
  onVerify: (token: string) => void;
  onExpire?: () => void;
}

export default function TurnstileCaptcha({
  onVerify,
  onExpire,
}: TurnstileCaptchaProps) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  if (!siteKey) {
    return (
      <p className="text-red-500">
        Turnstile site key is not configured.
      </p>
    );
  }

  return (
    <div className="my-4">
      <Turnstile
        siteKey={siteKey}
        onSuccess={onVerify}
        onExpire={onExpire}
        onError={() => {
          console.error("Turnstile verification error");
        }}
      />
    </div>
  );
}