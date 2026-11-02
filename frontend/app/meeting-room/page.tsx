
"use client";

import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

type Participant = {
  userId: number;
  socketId: string;
};

type ChatMessage = {
  userId: number;
  socketId: string;
  message: string;
  timestamp: string;
};

export default function MeetingRoomPage() {
  const socketRef = useRef<Socket | null>(null);

  const [token, setToken] = useState("");
  const [roomId, setRoomId] = useState("");
  const [connected, setConnected] = useState(false);
  const [inRoom, setInRoom] = useState(false);
  const [status, setStatus] = useState("Not connected");

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [message, setMessage] = useState("");

  const [myHandRaised, setMyHandRaised] = useState(false);
  const [raisedHands, setRaisedHands] = useState<Record<string, boolean>>({});

  useEffect(() => {
    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  const connectSocket = () => {
    socketRef.current?.disconnect();
    socketRef.current = null;

    if (!token.trim()) {
      setStatus("Login token required");
      return;
    }

    setStatus("Connecting...");

    const socket = io("http://localhost:5000", {
      auth: { token: token.trim() },
      transports: ["websocket", "polling"],
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      setStatus("Connected");
    });

    socket.on(
      "socket:ready",
      (data: { success: boolean; message: string }) => {
        setStatus(data.success ? "Authenticated successfully" : data.message);
      }
    );

    socket.on("connect_error", (error) => {
      setConnected(false);
      setStatus(`Connection rejected: ${error.message}`);
    });

    socket.on("disconnect", (reason) => {
      setConnected(false);
      setInRoom(false);
      setStatus(`Disconnected: ${reason}`);
    });

    socket.on(
      "room:created",
      (data: { roomId: string; participants: Participant[] }) => {
        setRoomId(data.roomId);
        setParticipants(data.participants || []);
        setInRoom(true);
        setStatus("Meeting room created successfully");
      }
    );

    socket.on(
      "room:joined",
      (data: { roomId: string; participants: Participant[] }) => {
        setRoomId(data.roomId);
        setParticipants(data.participants || []);
        setInRoom(true);

        if (socket.id) {
          setParticipants((prev) => {
            const exists = prev.some((p) => p.socketId === socket.id);
            return exists
              ? prev
              : [...prev, { userId: 0, socketId: socket.id! }];
          });
        }

        setStatus("Joined meeting room successfully");
      }
    );

    socket.on(
      "room:participant-joined",
      (data: Participant & { roomId: string }) => {
        setParticipants((prev) => {
          if (prev.some((p) => p.socketId === data.socketId)) {
            return prev;
          }
          return [...prev, data];
        });

        setStatus(`Participant ${data.userId} joined`);
      }
    );

    socket.on(
      "room:participant-left",
      (data: Participant & { roomId: string }) => {
        setParticipants((prev) =>
          prev.filter((p) => p.socketId !== data.socketId)
        );

        setRaisedHands((prev) => {
          const updated = { ...prev };
          delete updated[data.socketId];
          return updated;
        });

        setStatus(`Participant ${data.userId} left`);
      }
    );

    socket.on(
      "room:message",
      (data: ChatMessage & { roomId: string }) => {
        setMessages((prev) => [...prev, data]);
      }
    );

    socket.on(
      "room:raise-hand",
      (data: {
        roomId: string;
        userId: number;
        socketId: string;
        raised: boolean;
      }) => {
        setRaisedHands((prev) => ({
          ...prev,
          [data.socketId]: data.raised,
        }));
      }
    );

    socket.on("room:error", (data: { message: string }) => {
      setStatus(`Room error: ${data.message}`);
    });

    socket.on("room:left", () => {
      setInRoom(false);
      setParticipants([]);
      setMessages([]);
      setRaisedHands({});
      setMyHandRaised(false);
      setStatus("You left the meeting room");
    });
  };

  const createRoom = () => {
    if (!connected || !socketRef.current) {
      setStatus("Connect and authenticate first");
      return;
    }

    socketRef.current.emit("room:create");
  };

  const joinRoom = () => {
    if (!connected || !socketRef.current) {
      setStatus("Connect and authenticate first");
      return;
    }

    if (!roomId.trim()) {
      setStatus("Enter a Room ID");
      return;
    }

    socketRef.current.emit("room:join", {
      roomId: roomId.trim(),
    });
  };

  const sendMessage = () => {
    const text = message.trim();

    if (!text || !inRoom || !socketRef.current) {
      return;
    }

    if (text.length > 1000) {
      setStatus("Message must be 1000 characters or less");
      return;
    }

    const socket = socketRef.current;

    setMessages((prev) => [
      ...prev,
      {
        userId: 0,
        socketId: socket.id || "",
        message: text,
        timestamp: new Date().toISOString(),
      },
    ]);

    socket.emit("room:message", {
      roomId,
      message: text,
    });

    setMessage("");
  };

  const toggleRaiseHand = () => {
    if (!inRoom || !socketRef.current) {
      return;
    }

    const raised = !myHandRaised;
    setMyHandRaised(raised);

    if (socketRef.current.id) {
      setRaisedHands((prev) => ({
        ...prev,
        [socketRef.current!.id!]: raised,
      }));
    }

    socketRef.current.emit("room:raise-hand", {
      roomId,
      raised,
    });
  };

  const leaveRoom = () => {
    if (!socketRef.current || !inRoom) {
      return;
    }

    socketRef.current.emit("room:leave", {
      roomId,
    });
  };

  const disconnectSocket = () => {
    socketRef.current?.disconnect();
    socketRef.current = null;

    setConnected(false);
    setInRoom(false);
    setParticipants([]);
    setMessages([]);
    setRaisedHands({});
    setMyHandRaised(false);
    setStatus("Disconnected");
  };

  return (
    <main className="min-h-screen bg-gray-100 p-6 text-gray-900">
      <section className="mx-auto max-w-5xl rounded-xl bg-white p-6 shadow">
        <h1 className="mb-2 text-3xl font-bold">
          Multilingual Commenting System
        </h1>

        <h2 className="mb-5 text-xl font-semibold">Meeting Room</h2>

        <label className="mb-2 block font-medium">Login Token</label>

        <input
          type="password"
          autoComplete="off"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder="Paste fresh login token"
          className="mb-4 w-full rounded-lg border p-3"
        />

        <div className="mb-5 flex flex-wrap gap-3">
          <button
            onClick={connectSocket}
            disabled={connected}
            className="rounded-lg bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
          >
            Connect
          </button>

          <button
            onClick={disconnectSocket}
            className="rounded-lg bg-gray-200 px-4 py-2"
          >
            Disconnect
          </button>
        </div>

        <div className="mb-5 rounded-lg border bg-gray-50 p-4">
          <p className="font-semibold">Status: {status}</p>
          <p className="text-sm text-gray-600">
            Connection: {connected ? "Connected" : "Disconnected"}
          </p>
          <p className="text-sm text-gray-600">
            Meeting: {inRoom ? "Active" : "Not joined"}
          </p>
        </div>

        <div className="mb-6 rounded-lg border p-4">
          <h3 className="mb-3 text-lg font-semibold">Create or Join Meeting</h3>

          <button
            onClick={createRoom}
            disabled={!connected || inRoom}
            className="mb-4 rounded-lg bg-green-600 px-4 py-2 text-white disabled:opacity-50"
          >
            Create Room
          </button>

          <label className="mb-2 block font-medium">Room ID</label>

          <input
            value={roomId}
            onChange={(event) => setRoomId(event.target.value)}
            placeholder="Enter Room ID"
            className="mb-3 w-full rounded-lg border p-3"
          />

          <button
            onClick={joinRoom}
            disabled={!connected || inRoom}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-white disabled:opacity-50"
          >
            Join Room
          </button>
        </div>

        {inRoom && (
          <>
            <div className="mb-6 rounded-lg border p-4">
              <h3 className="mb-3 text-lg font-semibold">
                Participants ({participants.length})
              </h3>

              {participants.map((participant) => (
                <div
                  key={participant.socketId}
                  className="mb-2 flex items-center justify-between rounded-lg bg-gray-50 p-3"
                >
                  <span>
                    {participant.socketId === socketRef.current?.id
                      ? "You"
                      : `User ${participant.userId || "Participant"}`}
                  </span>

                  <span className="text-sm">
                    {raisedHands[participant.socketId]
                      ? "✋ Hand Raised"
                      : "🟢 Connected"}
                  </span>
                </div>
              ))}
            </div>

            <div className="mb-6 rounded-lg border p-4">
              <h3 className="mb-3 text-lg font-semibold">Meeting Chat</h3>

              <div className="mb-4 h-64 overflow-y-auto rounded-lg bg-gray-50 p-3">
                {messages.length === 0 && (
                  <p className="text-sm text-gray-500">
                    No messages yet. Start the conversation!
                  </p>
                )}

                {messages.map((msg, index) => (
                  <div
                    key={`${msg.timestamp}-${index}`}
                    className="mb-3 rounded-lg bg-white p-3 shadow-sm"
                  >
                    <p className="font-medium">
                      {msg.socketId === socketRef.current?.id
                        ? "You"
                        : `User ${msg.userId || "Participant"}`}
                    </p>

                    <p className="break-words">{msg.message}</p>

                    <p className="mt-1 text-xs text-gray-500">
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                <input
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      sendMessage();
                    }
                  }}
                  maxLength={1000}
                  placeholder="Type a message..."
                  className="min-w-0 flex-1 rounded-lg border p-3"
                />

                <button
                  onClick={sendMessage}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-white"
                >
                  Send
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={toggleRaiseHand}
                className={`rounded-lg px-4 py-2 text-white ${
                  myHandRaised ? "bg-orange-600" : "bg-purple-600"
                }`}
              >
                {myHandRaised ? "Lower Hand" : "✋ Raise Hand"}
              </button>

              <button
                onClick={leaveRoom}
                className="rounded-lg bg-red-600 px-4 py-2 text-white"
              >
                Leave Meeting
              </button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
