"use client";

import { useState } from "react";

interface ReportCommentProps {
  commentId: number;
  onReported?: () => void;
}

export default function ReportComment({
  commentId,
  onReported,
}: ReportCommentProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const reasons = [
    { value: "SPAM", label: "Spam" },
    { value: "HARASSMENT", label: "Harassment" },
    {
      value: "OFFENSIVE_CONTENT",
      label: "Offensive content",
    },
    {
      value: "HATE_SPEECH",
      label: "Hate speech",
    },
    {
      value: "MISINFORMATION",
      label: "Misinformation",
    },
    { value: "OTHER", label: "Other" },
  ];

  const submitReport = async () => {
    if (!reason) {
      setMessage("Please select a reason.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const token = localStorage.getItem("token");

      if (!token) {
        setMessage(
          "Authentication token not found. Please log in first."
        );
        setLoading(false);
        return;
      }

      const response = await fetch(
        "http://localhost:5000/api/reports",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            commentId,
            reason,
          }),
        }
      );

      const data = await response.json();

      if (response.ok) {
        setMessage(
          data.message || "Comment reported successfully."
        );

        setReason("");

        if (onReported) {
          onReported();
        }
      } else {
        setMessage(
          data.message || "Unable to report comment."
        );
      }
    } catch (error) {
      console.error("Report error:", error);
      setMessage("Unable to connect to backend.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          setMessage("");
        }}
        className="text-sm font-medium text-red-600 hover:text-red-700"
      >
        🚩 Report
      </button>

      {isOpen && (
        <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <h3 className="mb-3 font-semibold text-gray-900">
            Report this comment
          </h3>

          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white p-3 text-gray-900"
          >
            <option value="">
              Select a reason
            </option>

            {reasons.map((item) => (
              <option
                key={item.value}
                value={item.value}
              >
                {item.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={submitReport}
            disabled={loading}
            className="mt-3 rounded-lg bg-red-600 px-5 py-2 font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-gray-400"
          >
            {loading ? "Reporting..." : "Submit Report"}
          </button>

          {message && (
            <p className="mt-3 text-sm text-gray-700">
              {message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}