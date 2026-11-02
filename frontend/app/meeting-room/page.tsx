
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
  const myUserIdRef = useRef<number | null>(null);
  const roomIdRef = useRef("");

  const [token, setToken] = useState("");
  const [roomId, setRoomId] = useState("");
  const [connected, setConnected] = useState(false);
  const [inRoom, setInRoom] = useState(false);
  const [status, setStatus] = useState("Not connected");

  const [myUserId, setMyUserId] = useState<number | null>(null);
  const [hostUserId, setHostUserId] = useState<number | null>(null);
  const [locked, setLocked] = useState(false);

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [message, setMessage] = useState("");

  const [myHandRaised, setMyHandRaised] = useState(false);
  const [raisedHands, setRaisedHands] = useState<Record<string, boolean>>({});

  const isHost =
    myUserId !== null &&
    hostUserId !== null &&
    myUserId === hostUserId;

  const resetMeetingState = () => {
    setInRoom(false);
    setParticipants([]);
    setMessages([]);
    setRaisedHands({});
    setMyHandRaised(false);
    setHostUserId(null);
    setLocked(false);
    roomIdRef.current = "";
  };

  useEffect(() => {
    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  const connectSocket = () => {
    socketRef.current?.disconnect();
    socketRef.current = null;

    setConnected(false);
    setMyUserId(null);
    myUserIdRef.current = null;
    resetMeetingState();

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
      "socket:connected",
      (data: { userId: number; socketId: string }) => {
        myUserIdRef.current = data.userId;
        setMyUserId(data.userId);
        setStatus(`Authenticated as User ${data.userId}`);
      }
    );

    socket.on("connect_error", (error) => {
      setConnected(false);
      setStatus(`Connection rejected: ${error.message}`);
    });

    socket.on("disconnect", (reason) => {
      setConnected(false);
      resetMeetingState();
      setStatus(`Disconnected: ${reason}`);
    });

    // ROOM CREATED
    socket.on(
      "room:created",
      (data: {
        roomId: string;
        hostUserId: number;
        locked: boolean;
        participants: Participant[];
      }) => {
        roomIdRef.current = data.roomId;
        setRoomId(data.roomId);
        setHostUserId(data.hostUserId);
        setLocked(data.locked);
        setParticipants(data.participants || []);
        setMessages([]);
        setRaisedHands({});
        setMyHandRaised(false);
        setInRoom(true);
        setStatus("Meeting room created successfully");
      }
    );

    // ROOM JOINED
    socket.on(
      "room:joined",
      (data: {
        roomId: string;
        hostUserId: number;
        locked: boolean;
        participants: Participant[];
      }) => {
        roomIdRef.current = data.roomId;
        setRoomId(data.roomId);
        setHostUserId(data.hostUserId);
        setLocked(data.locked);

        const existingParticipants = data.participants || [];
        const currentSocketId = socket.id;
        const currentUserId = myUserIdRef.current;

        const updatedParticipants = [...existingParticipants];

        if (
          currentSocketId &&
          !updatedParticipants.some(
            (participant) => participant.socketId === currentSocketId
          )
        ) {
          updatedParticipants.push({
            userId: currentUserId ?? 0,
            socketId: currentSocketId,
          });
        }

        setParticipants(updatedParticipants);
        setMessages([]);
        setRaisedHands({});
        setMyHandRaised(false);
        setInRoom(true);
        setStatus("Joined meeting room successfully");
      }
    );

    // PARTICIPANT JOINED
    socket.on(
      "room:participant-joined",
      (data: Participant & { roomId: string }) => {
        setParticipants((prev) => {
          if (prev.some((participant) => participant.socketId === data.socketId)) {
            return prev;
          }

          return [...prev, data];
        });

        setStatus(`Participant ${data.userId} joined`);
      }
    );

    // PARTICIPANT LEFT
    socket.on(
      "room:participant-left",
      (data: Participant & { roomId: string }) => {
        setParticipants((prev) =>
          prev.filter((participant) => participant.socketId !== data.socketId)
        );

        setRaisedHands((prev) => {
          const updated = { ...prev };
          delete updated[data.socketId];
          return updated;
        });

        setStatus(`Participant ${data.userId} left`);
      }
    );

    // HOST CHANGED
    socket.on(
      "room:host-changed",
      (data: {
        roomId: string;
        hostUserId: number;
        hostSocketId: string;
      }) => {
        setHostUserId(data.hostUserId);

        setStatus(
          data.hostUserId === myUserIdRef.current
            ? "You are now the meeting host"
            : `Meeting host changed to User ${data.hostUserId}`
        );
      }
    );

    // MEETING LOCKED / UNLOCKED
    socket.on(
      "room:locked",
      (data: {
        roomId: string;
        locked: boolean;
        hostUserId: number;
      }) => {
        setLocked(data.locked);
        setHostUserId(data.hostUserId);

        setStatus(
          data.locked
            ? "Meeting locked by host"
            : "Meeting unlocked by host"
        );
      }
    );

    // PARTICIPANT REMOVED
    socket.on(
      "room:participant-removed",
      (data: { roomId: string; message: string }) => {
        if (data.roomId !== roomIdRef.current) {
          return;
        }

        resetMeetingState();
        setStatus(data.message || "You were removed from the meeting");
      }
    );

    // ROOM CHAT
    socket.on(
      "room:message",
      (data: ChatMessage & { roomId: string }) => {
        setMessages((prev) => [...prev, data]);
      }
    );

    // RAISE HAND
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

    // ROOM ERROR
    socket.on("room:error", (data: { message: string }) => {
      setStatus(`Room error: ${data.message}`);
    });

    // LEFT ROOM
    socket.on("room:left", () => {
      resetMeetingState();
      setStatus("You left the meeting room");
    });
  };

  const createRoom = () => {
    if (!connected || !socketRef.current) {
      setStatus("Connect and authenticate first");
      return;
    }

    if (inRoom) {
      setStatus("Leave your current meeting first");
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

    if (inRoom) {
      setStatus("Leave your current meeting first");
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
        userId: myUserId ?? 0,
        socketId: socket.id || "",
        message: text,
        timestamp: new Date().toISOString(),
      },
    ]);

    socket.emit("room:message", {
      roomId: roomIdRef.current,
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

    const socketId = socketRef.current.id;

    if (socketId) {
      setRaisedHands((prev) => ({
        ...prev,
        [socketId]: raised,
      }));
    }

    socketRef.current.emit("room:raise-hand", {
      roomId: roomIdRef.current,
      raised,
    });
  };

  const toggleMeetingLock = () => {
    if (!inRoom || !isHost || !socketRef.current) {
      setStatus("Only the host can lock or unlock the meeting");
      return;
    }

    socketRef.current.emit("room:lock", {
      roomId: roomIdRef.current,
      locked: !locked,
    });
  };

  const removeParticipant = (targetSocketId: string) => {
    if (!inRoom || !isHost || !socketRef.current) {
      setStatus("Only the host can remove participants");
      return;
    }

    if (targetSocketId === socketRef.current.id) {
      setStatus("You cannot remove yourself");
      return;
    }

    socketRef.current.emit("room:remove-participant", {
      roomId: roomIdRef.current,
      targetSocketId,
    });
  };

  const leaveRoom = () => {
    if (!socketRef.current || !inRoom) {
      return;
    }

    socketRef.current.emit("room:leave", {
      roomId: roomIdRef.current,
    });
  };

  const disconnectSocket = () => {
    socketRef.current?.disconnect();
    socketRef.current = null;

    setConnected(false);
    setMyUserId(null);
    myUserIdRef.current = null;
    resetMeetingState();

    setStatus("Disconnected");
  };

  return (
    <main className="min-h-screen bg-gray-100 p-6 text-gray-900">
      <section className="mx-auto max-w-5xl rounded-xl bg-white p-6 shadow">
        <h1 className="mb-2 text-3xl font-bold">
          Multilingual Commenting System
        </h1>

        <h2 className="mb-5 text-xl font-semibold">Meeting Room</h2>

        <label className="mb-2 block font-medium">
          Login Token
        </label>

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
            User ID: {myUserId ?? "Not authenticated"}
          </p>

          <p className="text-sm text-gray-600">
            Connection: {connected ? "Connected" : "Disconnected"}
          </p>

          <p className="text-sm text-gray-600">
            Meeting: {inRoom ? "Active" : "Not joined"}
          </p>

          {inRoom && (
            <>
              <p className="text-sm text-gray-600">
                Host: User {hostUserId ?? "Unknown"}
                {isHost ? " (You)" : ""}
              </p>

              <p className="text-sm font-medium">
                Meeting Status: {locked ? "Locked 🔒" : "Unlocked 🔓"}
              </p>
            </>
          )}
        </div>

        <div className="mb-6 rounded-lg border p-4">
          <h3 className="mb-3 text-lg font-semibold">
            Create or Join Meeting
          </h3>

          <button
            onClick={createRoom}
            disabled={!connected || inRoom}
            className="mb-4 rounded-lg bg-green-600 px-4 py-2 text-white disabled:opacity-50"
          >
            Create Room
          </button>

          <label className="mb-2 block font-medium">
            Room ID
          </label>

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
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-lg font-semibold">
                  Participants ({participants.length})
                </h3>

                {isHost && (
                  <button
                    onClick={toggleMeetingLock}
                    className={`rounded-lg px-4 py-2 text-white ${
                      locked ? "bg-green-600" : "bg-orange-600"
                    }`}
                  >
                    {locked ? "Unlock Meeting 🔓" : "Lock Meeting 🔒"}
                  </button>
                )}
              </div>

              {participants.map((participant) => {
                const participantIsHost =
                  participant.userId === hostUserId;

                const participantIsMe =
                  participant.socketId === socketRef.current?.id;

                return (
                  <div
                    key={participant.socketId}
                    className="mb-2 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-gray-50 p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span>
                        {participantIsMe
                          ? "You"
                          : `User ${participant.userId || "Participant"}`}
                      </span>

                      {participantIsHost && (
                        <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-700">
                          Host
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm">
                        {raisedHands[participant.socketId]
                          ? "✋ Hand Raised"
                          : "🟢 Connected"}
                      </span>

                      {isHost &&
                        !participantIsMe &&
                        !participantIsHost && (
                          <button
                            onClick={() =>
                              removeParticipant(participant.socketId)
                            }
                            className="rounded-lg bg-red-600 px-3 py-1 text-sm text-white"
                          >
                            Remove
                          </button>
                        )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mb-6 rounded-lg border p-4">
              <h3 className="mb-3 text-lg font-semibold">
                Meeting Chat
              </h3>

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
