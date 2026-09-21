"use client";

import { useEffect, useState } from "react";
import TurnstileCaptcha from "@/components/TurnstileCaptcha";
import ReportComment from "@/components/ReportComment";

interface Author {
  id: number;
  username: string;
  location?: string | null;
  avatarUrl?: string | null;
}

interface Reply {
  id: number;
  content: string;
  language: string | null;
  isEdited: boolean;
  createdAt: string;
  updatedAt: string;
  author: Author;
  likeCount: number;
  dislikeCount: number;
}

interface Comment {
  id: number;
  content: string;
  language: string | null;
  isEdited: boolean;
  createdAt: string;
  updatedAt: string;
  author: Author;
  likeCount: number;
  dislikeCount: number;
  replyCount: number;
  relevanceScore: number;
  replies: Reply[];
}

export default function Home() {
  // -----------------------------
  // POST COMMENT
  // -----------------------------
  const [content, setContent] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  // -----------------------------
  // CAPTCHA
  // -----------------------------
  const [captchaRequired, setCaptchaRequired] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(
    null
  );

  // -----------------------------
  // COMMENTS
  // -----------------------------
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(true);

  // -----------------------------
  // GET COMMENTS
  // -----------------------------
  const fetchComments = async () => {
    try {
      setCommentsLoading(true);

      const response = await fetch(
        "http://localhost:5000/api/comments?sort=newest"
      );

      const data = await response.json();

      if (response.ok) {
        setComments(data.comments || []);
      }
    } catch (error) {
      console.error("Get comments error:", error);
    } finally {
      setCommentsLoading(false);
    }
  };

  useEffect(() => {
    fetchComments();
  }, []);

  // -----------------------------
  // SUBMIT COMMENT
  // -----------------------------
  const submitComment = async () => {
    if (!content.trim()) {
      setMessage("Please enter a comment.");
      return;
    }

    if (captchaRequired && !turnstileToken) {
      setMessage("Please complete the CAPTCHA first.");
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
        "http://localhost:5000/api/comments",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            content: content.trim(),
            ...(turnstileToken
              ? { turnstileToken }
              : {}),
          }),
        }
      );

      const data = await response.json();

      if (response.ok) {
        setMessage(
          data.message || "Comment posted successfully!"
        );

        setContent("");
        setCaptchaRequired(false);
        setTurnstileToken(null);

        // Refresh comments after posting
        fetchComments();
      } else {
        if (data.captchaRequired) {
          setCaptchaRequired(true);
          setTurnstileToken(null);
        }

        setMessage(
          data.message || "Failed to post comment."
        );
      }
    } catch (error) {
      console.error("Comment submission error:", error);
      setMessage("Unable to connect to backend.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-100 px-4 py-10">
      <div className="mx-auto max-w-3xl">

        {/* -------------------------------- */}
        {/* HEADER */}
        {/* -------------------------------- */}

        <div className="mb-8 rounded-xl bg-white p-8 text-center shadow-lg">
          <h1 className="text-3xl font-bold text-gray-900">
            Multilingual Commenting System
          </h1>

          <p className="mt-3 text-gray-600">
            Comments with moderation, language detection,
            CAPTCHA and reporting
          </p>
        </div>

        {/* -------------------------------- */}
        {/* POST COMMENT */}
        {/* -------------------------------- */}

        <div className="rounded-xl bg-white p-6 shadow-lg">
          <h2 className="mb-4 text-xl font-semibold text-gray-900">
            Post a Comment
          </h2>

          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write your comment..."
            rows={5}
            className="w-full rounded-lg border border-gray-300 p-4 text-gray-900 outline-none focus:border-blue-500"
          />

          {/* CAPTCHA */}

          {captchaRequired && (
            <div className="mt-4 rounded-lg border border-yellow-300 bg-yellow-50 p-4">
              <p className="mb-3 font-medium text-gray-800">
                CAPTCHA verification is required because of
                repeated posting attempts.
              </p>

              <TurnstileCaptcha
                onVerify={(token) => {
                  setTurnstileToken(token);

                  setMessage(
                    "CAPTCHA verified. You can now post your comment."
                  );
                }}
                onExpire={() => {
                  setTurnstileToken(null);

                  setMessage(
                    "CAPTCHA expired. Please verify again."
                  );
                }}
              />
            </div>
          )}

          <button
            onClick={submitComment}
            disabled={loading}
            className="mt-5 w-full rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
          >
            {loading ? "Posting..." : "Post Comment"}
          </button>

          {message && (
            <div className="mt-4 rounded-lg bg-gray-50 p-4 text-center">
              <p className="text-gray-700">
                {message}
              </p>
            </div>
          )}
        </div>

        {/* -------------------------------- */}
        {/* COMMENTS */}
        {/* -------------------------------- */}

        <div className="mt-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900">
              Comments
            </h2>

            <button
              onClick={fetchComments}
              className="rounded-lg bg-gray-200 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-300"
            >
              Refresh
            </button>
          </div>

          {commentsLoading ? (
            <div className="rounded-xl bg-white p-6 text-center shadow">
              <p className="text-gray-600">
                Loading comments...
              </p>
            </div>
          ) : comments.length === 0 ? (
            <div className="rounded-xl bg-white p-6 text-center shadow">
              <p className="text-gray-600">
                No comments yet.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {comments.map((comment) => (
                <div
                  key={comment.id}
                  className="rounded-xl bg-white p-6 shadow-lg"
                >

                  {/* AUTHOR */}

                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 font-bold text-blue-700">
                      {comment.author.username
                        .charAt(0)
                        .toUpperCase()}
                    </div>

                    <div>
                      <p className="font-semibold text-gray-900">
                        {comment.author.username}
                      </p>

                      <p className="text-xs text-gray-500">
                        {comment.author.location || "Unknown location"}
                        {" • "}
                        {new Date(
                          comment.createdAt
                        ).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {/* COMMENT */}

                  <p className="mt-4 text-gray-800">
                    {comment.content}
                  </p>

                  {/* COMMENT INFO */}

                  <div className="mt-3 flex flex-wrap gap-3 text-sm text-gray-500">
                    <span>
                      Language:{" "}
                      {comment.language || "Unknown"}
                    </span>

                    <span>
                      👍 {comment.likeCount}
                    </span>

                    <span>
                      👎 {comment.dislikeCount}
                    </span>

                    <span>
                      💬 {comment.replyCount}
                    </span>

                    {comment.isEdited && (
                      <span>
                        Edited
                      </span>
                    )}
                  </div>

                  {/* REPORT */}

                  <ReportComment
                    commentId={comment.id}
                    onReported={() => {
                      console.log(
                        `Comment ${comment.id} reported`
                      );
                    }}
                  />

                  {/* REPLIES */}

                  {comment.replies &&
                    comment.replies.length > 0 && (
                      <div className="mt-5 border-l-2 border-gray-200 pl-5">

                        <p className="mb-3 font-semibold text-gray-700">
                          Replies
                        </p>

                        <div className="space-y-4">
                          {comment.replies.map((reply) => (
                            <div
                              key={reply.id}
                              className="rounded-lg bg-gray-50 p-4"
                            >
                              <div className="flex items-center gap-2">
                                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 text-sm font-bold text-green-700">
                                  {reply.author.username
                                    .charAt(0)
                                    .toUpperCase()}
                                </div>

                                <div>
                                  <p className="text-sm font-semibold text-gray-900">
                                    {reply.author.username}
                                  </p>

                                  <p className="text-xs text-gray-500">
                                    {new Date(
                                      reply.createdAt
                                    ).toLocaleString()}
                                  </p>
                                </div>
                              </div>

                              <p className="mt-2 text-gray-800">
                                {reply.content}
                              </p>

                              <div className="mt-2 text-xs text-gray-500">
                                👍 {reply.likeCount}
                                {"  "}
                                👎 {reply.dislikeCount}
                              </div>

                              {/* REPORT REPLY */}

                              <ReportComment
                                commentId={reply.id}
                                onReported={() => {
                                  console.log(
                                    `Reply ${reply.id} reported`
                                  );
                                }}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}