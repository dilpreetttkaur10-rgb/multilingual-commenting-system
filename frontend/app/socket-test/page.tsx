
"use client";

import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

export default function SocketTestPage() {
  const socketRef = useRef<Socket | null>(null);
  const [token, setToken] = useState("");
  const [status, setStatus] = useState("Not connected");
  const [details, setDetails] = useState(
    "Enter your fresh login token and click Test Connection."
  );

  const connectSocket = () => {
    socketRef.current?.disconnect();
    socketRef.current = null;

    if (!token.trim()) {
      setStatus("Token required");
      setDetails("Enter the token returned by your successful login.");
      return;
    }

    setStatus("Connecting...");
    setDetails("Checking your token and database session.");

    const socket = io("http://localhost:5000", {
      auth: { token: token.trim() },
      transports: ["websocket", "polling"],
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setStatus("Connected");
      setDetails("Socket connection established. Waiting for authentication confirmation.");
    });

    socket.on("socket:ready", (data: { success: boolean; message: string }) => {
      setStatus(data.success ? "Authenticated successfully" : "Connected");
      setDetails(data.message);
      setToken("");
    });

    socket.on("connect_error", (error) => {
      setStatus("Connection rejected");
      setDetails(error.message);
    });

    socket.on("disconnect", (reason) => {
      setStatus("Disconnected");
      if (reason !== "io client disconnect") {
        setDetails(`Reason: ${reason}`);
      }
    });
  };

  const disconnectSocket = () => {
    socketRef.current?.disconnect();
    socketRef.current = null;
    setToken("");
    setStatus("Disconnected");
    setDetails("Test connection closed.");
  };

  useEffect(() => {
    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  return (
    <main className="min-h-screen bg-gray-100 p-6 text-gray-900">
      <section className="mx-auto max-w-xl rounded-xl bg-white p-6 shadow">
        <h1 className="mb-2 text-2xl font-bold">
          Socket.IO Connection Test
        </h1>

        <p className="mb-4 text-sm text-gray-600">
          Paste your fresh login token locally. It will not be displayed in
          the status messages or sent to this chat.
        </p>

        <label htmlFor="token" className="mb-2 block font-medium">
          Login token
        </label>

        <input
          id="token"
          type="password"
          autoComplete="off"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder="Paste token here"
          className="mb-4 w-full rounded-lg border border-gray-300 p-3"
        />

        <div className="mb-5 rounded-lg border p-4">
          <p className="font-semibold">Status: {status}</p>
          <p className="mt-2 break-words text-sm text-gray-600">
            {details}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={connectSocket}
            className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            Test Connection
          </button>

          <button
            onClick={disconnectSocket}
            className="rounded-lg bg-gray-200 px-4 py-2 text-gray-900 hover:bg-gray-300"
          >
            Disconnect
          </button>
        </div>
      </section>
    </main>
  );
}
