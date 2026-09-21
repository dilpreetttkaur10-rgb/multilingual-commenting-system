"use client";

import { useEffect, useState } from "react";

interface Reporter {
  id: number;
  username: string;
  location: string | null;
  avatarUrl: string | null;
}

interface CommentAuthor {
  id: number;
  username: string;
  location: string | null;
  avatarUrl: string | null;
}

interface ReportedComment {
  id: number;
  content: string;
  language: string | null;
  isEdited: boolean;
  createdAt: string;
  updatedAt: string;
  author: CommentAuthor;
}

interface Report {
  id: number;
  reason: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  reporterId: number;
  commentId: number;
  reporter: Reporter;
  comment: ReportedComment;
}

const statusOptions = [
  "ALL",
  "PENDING",
  "REVIEWED",
  "RESOLVED",
  "DISMISSED",
];

export default function AdminPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [selectedStatus, setSelectedStatus] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const fetchReports = async () => {
    try {
      setLoading(true);
      setMessage("");

      const token = localStorage.getItem("token");

      if (!token) {
        setMessage(
          "Authentication token not found. Please log in first."
        );
        setReports([]);
        return;
      }

      let url = "http://localhost:5000/api/reports";

      if (selectedStatus !== "ALL") {
        url += `?status=${selectedStatus}`;
      }

      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (response.ok) {
        setReports(data.reports || []);
      } else {
        setReports([]);
        setMessage(
          data.message || "Unable to load reports."
        );
      }
    } catch (error) {
      console.error("Fetch reports error:", error);
      setReports([]);
      setMessage("Unable to connect to backend.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, [selectedStatus]);

  const updateStatus = async (
    reportId: number,
    newStatus: string
  ) => {
    try {
      setUpdatingId(reportId);
      setMessage("");

      const token = localStorage.getItem("token");

      if (!token) {
        setMessage(
          "Authentication token not found. Please log in first."
        );
        return;
      }

      const response = await fetch(
        `http://localhost:5000/api/reports/${reportId}/status`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            status: newStatus,
          }),
        }
      );

      const data = await response.json();

      if (response.ok) {
        setMessage(
          `Report #${reportId} updated to ${newStatus}.`
        );

        await fetchReports();
      } else {
        setMessage(
          data.message || "Unable to update report."
        );
      }
    } catch (error) {
      console.error("Update status error:", error);
      setMessage("Unable to connect to backend.");
    } finally {
      setUpdatingId(null);
    }
  };

  const pendingCount = reports.filter(
    (report) => report.status === "PENDING"
  ).length;

  const reviewedCount = reports.filter(
    (report) => report.status === "REVIEWED"
  ).length;

  const resolvedCount = reports.filter(
    (report) => report.status === "RESOLVED"
  ).length;

  const dismissedCount = reports.filter(
    (report) => report.status === "DISMISSED"
  ).length;

  return (
    <main className="min-h-screen bg-gray-100 px-4 py-10">
      <div className="mx-auto max-w-6xl">

        {/* HEADER */}
        <div className="mb-8 rounded-2xl bg-white p-8 shadow-lg">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">
                Admin Panel
              </p>

              <h1 className="mt-1 text-3xl font-bold text-gray-900">
                Moderation Dashboard
              </h1>

              <p className="mt-2 text-gray-600">
                Review reported comments and manage moderation.
              </p>
            </div>

            <button
              onClick={fetchReports}
              className="rounded-lg bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700"
            >
              Refresh Reports
            </button>
          </div>
        </div>

        {/* MESSAGE */}
        {message && (
          <div className="mb-6 rounded-lg bg-blue-50 p-4">
            <p className="text-center font-medium text-blue-800">
              {message}
            </p>
          </div>
        )}

        {/* STATISTICS */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">

          <div className="rounded-xl bg-white p-5 shadow">
            <p className="text-sm text-gray-500">
              Total Reports
            </p>

            <p className="mt-2 text-3xl font-bold text-gray-900">
              {reports.length}
            </p>
          </div>

          <div className="rounded-xl bg-white p-5 shadow">
            <p className="text-sm text-gray-500">
              Pending
            </p>

            <p className="mt-2 text-3xl font-bold text-yellow-600">
              {pendingCount}
            </p>
          </div>

          <div className="rounded-xl bg-white p-5 shadow">
            <p className="text-sm text-gray-500">
              Reviewed
            </p>

            <p className="mt-2 text-3xl font-bold text-blue-600">
              {reviewedCount}
            </p>
          </div>

          <div className="rounded-xl bg-white p-5 shadow">
            <p className="text-sm text-gray-500">
              Resolved
            </p>

            <p className="mt-2 text-3xl font-bold text-green-600">
              {resolvedCount}
            </p>
          </div>

          <div className="rounded-xl bg-white p-5 shadow">
            <p className="text-sm text-gray-500">
              Dismissed
            </p>

            <p className="mt-2 text-3xl font-bold text-gray-600">
              {dismissedCount}
            </p>
          </div>

        </div>

        {/* FILTER */}
        <div className="mb-6 rounded-xl bg-white p-5 shadow">
          <label
            htmlFor="status"
            className="mr-4 font-semibold text-gray-800"
          >
            Filter Reports:
          </label>

          <select
            id="status"
            value={selectedStatus}
            onChange={(e) =>
              setSelectedStatus(e.target.value)
            }
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900"
          >
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {status === "ALL"
                  ? "All Reports"
                  : status}
              </option>
            ))}
          </select>
        </div>

        {/* REPORT LIST */}
        {loading ? (
          <div className="rounded-xl bg-white p-10 text-center shadow">
            <p className="text-gray-600">
              Loading reports...
            </p>
          </div>
        ) : reports.length === 0 ? (
          <div className="rounded-xl bg-white p-10 text-center shadow">
            <p className="text-lg font-semibold text-gray-800">
              No reports found
            </p>
          </div>
        ) : (
          <div className="space-y-6">

            {reports.map((report) => (
              <div
                key={report.id}
                className="rounded-2xl bg-white p-6 shadow-lg"
              >

                {/* REPORT TOP */}
                <div className="flex flex-col gap-4 border-b border-gray-200 pb-5 md:flex-row md:items-center md:justify-between">

                  <div>
                    <h2 className="text-xl font-bold text-gray-900">
                      Report #{report.id}
                    </h2>

                    <p className="mt-1 text-sm text-gray-500">
                      Created:{" "}
                      {new Date(
                        report.createdAt
                      ).toLocaleString()}
                    </p>
                  </div>

                  <div className="rounded-lg bg-red-50 px-5 py-3">
                    <p className="text-xs font-semibold uppercase text-red-500">
                      Reason
                    </p>

                    <p className="font-bold text-red-700">
                      {report.reason.replace(
                        /_/g,
                        " "
                      )}
                    </p>
                  </div>

                </div>

                {/* STATUS */}
                <div className="mt-5">
                  <span className="text-sm font-semibold text-gray-600">
                    Current Status:{" "}
                  </span>

                  <span
                    className={`rounded-full px-3 py-1 text-sm font-bold ${
                      report.status === "PENDING"
                        ? "bg-yellow-100 text-yellow-800"
                        : report.status === "REVIEWED"
                        ? "bg-blue-100 text-blue-800"
                        : report.status === "RESOLVED"
                        ? "bg-green-100 text-green-800"
                        : "bg-gray-200 text-gray-800"
                    }`}
                  >
                    {report.status}
                  </span>
                </div>

                {/* COMMENT */}
                <div className="mt-5 rounded-xl bg-gray-50 p-5">

                  <p className="text-xs font-bold uppercase text-gray-500">
                    Reported Comment
                  </p>

                  <p className="mt-3 text-lg text-gray-900">
                    {report.comment.content}
                  </p>

                  <div className="mt-4 flex flex-wrap gap-4 text-sm text-gray-500">

                    <span>
                      Comment ID: {report.comment.id}
                    </span>

                    <span>
                      Language:{" "}
                      {report.comment.language ||
                        "Unknown"}
                    </span>

                    <span>
                      {report.comment.isEdited
                        ? "Edited"
                        : "Not edited"}
                    </span>

                  </div>

                </div>

                {/* PEOPLE */}
                <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">

                  {/* AUTHOR */}
                  <div className="rounded-xl border border-gray-200 p-5">

                    <p className="text-xs font-bold uppercase text-gray-500">
                      Comment Author
                    </p>

                    <div className="mt-3 flex items-center gap-3">

                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 font-bold text-blue-700">
                        {report.comment.author.username
                          .charAt(0)
                          .toUpperCase()}
                      </div>

                      <div>
                        <p className="font-semibold text-gray-900">
                          {report.comment.author.username}
                        </p>

                        <p className="text-sm text-gray-500">
                          {report.comment.author.location ||
                            "Unknown location"}
                        </p>
                      </div>

                    </div>
                  </div>

                  {/* REPORTER */}
                  <div className="rounded-xl border border-gray-200 p-5">

                    <p className="text-xs font-bold uppercase text-gray-500">
                      Reported By
                    </p>

                    <div className="mt-3 flex items-center gap-3">

                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 font-bold text-green-700">
                        {report.reporter.username
                          .charAt(0)
                          .toUpperCase()}
                      </div>

                      <div>
                        <p className="font-semibold text-gray-900">
                          {report.reporter.username}
                        </p>

                        <p className="text-sm text-gray-500">
                          {report.reporter.location ||
                            "Unknown location"}
                        </p>
                      </div>

                    </div>
                  </div>

                </div>

                {/* MODERATION ACTIONS */}
                <div className="mt-6 border-t border-gray-200 pt-5">

                  <p className="mb-3 font-semibold text-gray-800">
                    Moderation Action
                  </p>

                  <div className="flex flex-wrap gap-3">

                    <button
                      onClick={() =>
                        updateStatus(
                          report.id,
                          "PENDING"
                        )
                      }
                      disabled={
                        updatingId === report.id ||
                        report.status === "PENDING"
                      }
                      className="rounded-lg bg-yellow-500 px-4 py-2 font-semibold text-white hover:bg-yellow-600 disabled:cursor-not-allowed disabled:bg-gray-300"
                    >
                      Mark Pending
                    </button>

                    <button
                      onClick={() =>
                        updateStatus(
                          report.id,
                          "REVIEWED"
                        )
                      }
                      disabled={
                        updatingId === report.id ||
                        report.status === "REVIEWED"
                      }
                      className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
                    >
                      Mark Reviewed
                    </button>

                    <button
                      onClick={() =>
                        updateStatus(
                          report.id,
                          "RESOLVED"
                        )
                      }
                      disabled={
                        updatingId === report.id ||
                        report.status === "RESOLVED"
                      }
                      className="rounded-lg bg-green-600 px-4 py-2 font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-300"
                    >
                      Resolve
                    </button>

                    <button
                      onClick={() =>
                        updateStatus(
                          report.id,
                          "DISMISSED"
                        )
                      }
                      disabled={
                        updatingId === report.id ||
                        report.status === "DISMISSED"
                      }
                      className="rounded-lg bg-gray-700 px-4 py-2 font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-300"
                    >
                      Dismiss
                    </button>

                  </div>

                  {updatingId === report.id && (
                    <p className="mt-3 text-sm text-gray-500">
                      Updating...
                    </p>
                  )}

                </div>

              </div>
            ))}

          </div>
        )}

      </div>
    </main>
  );
}