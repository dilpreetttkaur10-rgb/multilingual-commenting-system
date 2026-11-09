"use client";

import { useState } from "react";

const API =
  process.env.NEXT_PUBLIC_API_URL ||
  "https://multilingual-commenting-system-b16w.onrender.com/api";

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [pendingToken, setPendingToken] = useState("");
  const [otpRequired, setOtpRequired] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const finishLogin = (token: string) => {
    localStorage.setItem("token", token);
    window.location.href = "/";
  };

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      setMessage("Please enter email and password.");
      return;
    }

    if (mode === "register" && !username.trim()) {
      setMessage("Please enter a username.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const endpoint =
        mode === "register" ? "/auth/register" : "/auth/login";

      const body =
        mode === "register"
          ? { username: username.trim(), email: email.trim(), password }
          : { email: email.trim(), password };

      const response = await fetch(`${API}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.message || "Request failed.");
        return;
      }

      if (mode === "register") {
        setMessage("Registration successful! Please log in.");
        setMode("login");
        setPassword("");
        return;
      }

      if (data.verificationRequired) {
        setPendingToken(data.pendingToken);
        setOtpRequired(true);
        setMessage("OTP sent to your email. Enter it below.");
        return;
      }

      if (data.token) {
        finishLogin(data.token);
        return;
      }

      setMessage(data.message || "Login response was incomplete.");
    } catch {
      setMessage("Unable to connect to the backend.");
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    if (!/^\d{6}$/.test(otp)) {
      setMessage("Enter a valid 6-digit OTP.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const response = await fetch(`${API}/auth/verify-login-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otp, pendingToken }),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.message || "OTP verification failed.");
        return;
      }

      if (data.token) {
        finishLogin(data.token);
      } else {
        setMessage("Authentication token was not returned.");
      }
    } catch {
      setMessage("Unable to connect to the backend.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-100 px-4 py-10">
      <section className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        <h1 className="text-center text-2xl font-bold text-gray-900">
          Multilingual Commenting System
        </h1>

        <p className="mt-2 text-center text-gray-600">
          {otpRequired
            ? "Verify your new device"
            : mode === "login"
            ? "Login to your account"
            : "Create your account"}
        </p>

        {!otpRequired && (
          <>
            {mode === "register" && (
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Username"
                className="mt-6 w-full rounded-lg border p-3 text-gray-900"
              />
            )}

            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
              className="mt-4 w-full rounded-lg border p-3 text-gray-900"
            />

            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="mt-4 w-full rounded-lg border p-3 text-gray-900"
            />

            <button
              onClick={handleSubmit}
              disabled={loading}
              className="mt-6 w-full rounded-lg bg-blue-600 p-3 font-semibold text-white hover:bg-blue-700 disabled:bg-gray-400"
            >
              {loading
                ? "Please wait..."
                : mode === "login"
                ? "Login"
                : "Register"}
            </button>

            <p className="mt-5 text-center text-sm text-gray-600">
              {mode === "login"
                ? "Don't have an account?"
                : "Already have an account?"}{" "}
              <button
                onClick={() => {
                  setMode(mode === "login" ? "register" : "login");
                  setMessage("");
                }}
                className="font-semibold text-blue-600"
              >
                {mode === "login" ? "Register" : "Login"}
              </button>
            </p>
          </>
        )}

        {otpRequired && (
          <>
            <input
              value={otp}
              onChange={(e) =>
                setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              placeholder="Enter 6-digit OTP"
              inputMode="numeric"
              maxLength={6}
              className="mt-6 w-full rounded-lg border p-3 text-center text-gray-900 tracking-widest"
            />

            <button
              onClick={verifyOtp}
              disabled={loading}
              className="mt-4 w-full rounded-lg bg-green-600 p-3 font-semibold text-white hover:bg-green-700 disabled:bg-gray-400"
            >
              {loading ? "Verifying..." : "Verify OTP"}
            </button>
          </>
        )}

        {message && (
          <p className="mt-5 rounded-lg bg-gray-100 p-3 text-center text-sm text-gray-700">
            {message}
          </p>
        )}
      </section>
    </main>
  );
}