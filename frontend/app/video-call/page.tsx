
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

type CallEvent = {
  callId: string;
  callerId?: number;
  calleeId?: number;
  message?: string;
};

const SOCKET_URL = "http://localhost:5000";

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

export default function VideoCallPage() {
  const [token, setToken] = useState("");
  const [targetUserId, setTargetUserId] = useState("");
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [connectionQuality, setConnectionQuality] = useState(
    "Waiting for connection",
  );

  const [status, setStatus] = useState(
    "Enter your login token to connect.",
  );

  const [incomingCall, setIncomingCall] =
    useState<CallEvent | null>(null);

  const [inCall, setInCall] = useState(false);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);

  const callIdRef = useRef<string | null>(null);
  const roleRef = useRef<"caller" | "callee" | null>(null);

  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

  const stopMedia = useCallback(() => {
    peerRef.current?.close();
    peerRef.current = null;

    screenStreamRef.current?.getTracks().forEach((track) => {
      track.stop();
    });

    screenStreamRef.current = null;

    localStreamRef.current?.getTracks().forEach((track) => {
      track.stop();
    });

    localStreamRef.current = null;

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }

    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }

    pendingCandidatesRef.current = [];
    callIdRef.current = null;
    roleRef.current = null;

    setInCall(false);
    setIncomingCall(null);
    setMuted(false);
    setCameraOff(false);
    setScreenSharing(false);
  }, []);

  const getLocalMedia = useCallback(async () => {
    if (localStreamRef.current) {
      return localStreamRef.current;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(
        "Camera access is unavailable. Use localhost or HTTPS.",
      );
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true,
    });

    localStreamRef.current = stream;

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
      await localVideoRef.current.play().catch(() => {});
    }

    return stream;
  }, []);

  const createPeerConnection = useCallback((callId: string) => {
    if (peerRef.current) {
      return peerRef.current;
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerRef.current = pc;

    const stream = localStreamRef.current;

    if (stream) {
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });
    }

    pc.ontrack = (event) => {
      const remoteStream = event.streams[0];

      if (remoteVideoRef.current && remoteStream) {
        remoteVideoRef.current.srcObject = remoteStream;

        void remoteVideoRef.current.play().catch(() => {});
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current?.emit("webrtc:ice-candidate", {
          callId,
          candidate: event.candidate.toJSON(),
        });
      }
    };

    pc.onconnectionstatechange = () => {
      switch (pc.connectionState) {
        case "connected":
          setConnectionQuality("Video connection stable");
          setStatus("Video call connected.");
          break;

        case "connecting":
          setConnectionQuality("Connecting audio and video");
          setStatus("Connecting audio and video...");
          break;

        case "disconnected":
          setConnectionQuality("Connection interrupted");
          setStatus(
            "Video connection interrupted. Waiting for network recovery...",
          );
          break;

        case "failed":
          setConnectionQuality("Connection failed");
          setStatus(
            "WebRTC connection failed. End the call and try again. A TURN server may be required.",
          );
          break;

        case "closed":
          setConnectionQuality("Call closed");
          setStatus("Video connection closed.");
          break;

        default:
          setConnectionQuality(pc.connectionState);
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "checking") {
        setConnectionQuality("Checking network connection...");
      } else if (pc.iceConnectionState === "connected") {
        setConnectionQuality("ICE connection established");
      } else if (pc.iceConnectionState === "disconnected") {
        setConnectionQuality("ICE connection interrupted");
      } else if (pc.iceConnectionState === "failed") {
        setConnectionQuality("ICE connection failed");
        setStatus(
          "Network connection failed. Try ending and restarting the call.",
        );
      }
    };

    return pc;
  }, []);

  const flushPendingCandidates = useCallback(async () => {
    const pc = peerRef.current;

    if (!pc?.remoteDescription) {
      return;
    }

    const candidates = [...pendingCandidatesRef.current];
    pendingCandidatesRef.current = [];

    for (const candidate of candidates) {
      try {
        await pc.addIceCandidate(
          new RTCIceCandidate(candidate),
        );
      } catch (error) {
        console.error("Could not add ICE candidate:", error);
      }
    }
  }, []);

  const connectSocket = useCallback(() => {
    if (!token.trim()) {
      setStatus("Please enter your login token.");
      return;
    }

    if (socketRef.current?.connected) {
      setStatus("Already connected.");
      return;
    }

    socketRef.current?.disconnect();

    const socket = io(SOCKET_URL, {
      auth: { token: token.trim() },

      transports: ["websocket", "polling"],

      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    });

    socketRef.current = socket;

    setStatus("Connecting to the signaling server...");
    setConnectionQuality("Connecting...");

    socket.on("connect", () => {
      setConnected(true);
      setReconnecting(false);
      setReconnectAttempts(0);

      setConnectionQuality("Signaling server connected");

      setStatus(
        "Connected. Waiting for authentication confirmation...",
      );
    });

    socket.on("socket:ready", () => {
      setConnected(true);
      setReconnecting(false);

      setConnectionQuality("Authenticated");

      setStatus(
        "Authenticated. You can now make calls.",
      );
    });

    socket.on("reconnect_attempt", (attempt: number) => {
      setReconnecting(true);
      setReconnectAttempts(attempt);

      setConnectionQuality("Reconnecting...");

      setStatus(
        `Network interruption. Reconnecting... Attempt ${attempt}`,
      );
    });

    socket.on("reconnect", () => {
      setConnected(true);
      setReconnecting(false);

      setConnectionQuality("Signaling server reconnected");

      setStatus(
        "Signaling server reconnected. Check your video call status.",
      );
    });

    socket.on("reconnect_error", (error) => {
      setReconnecting(true);

      setConnectionQuality("Reconnection failed");

      setStatus(
        `Reconnection error: ${error.message}`,
      );
    });

    socket.on("connect_error", (error) => {
      setConnected(false);

      setConnectionQuality("Connection failed");

      setStatus(
        `Connection failed: ${error.message}`,
      );
    });

    socket.on("disconnect", (reason) => {
      setConnected(false);

      if (reason === "io server disconnect") {
        setReconnecting(false);

        setConnectionQuality("Disconnected by server");

        setStatus(
          "Server disconnected. Click Connect to reconnect.",
        );
      } else {
        setReconnecting(true);

        setConnectionQuality("Connection lost");

        setStatus(
          "Connection lost. Attempting to reconnect...",
        );
      }
    });

    socket.on("call:incoming", (data: CallEvent) => {
      callIdRef.current = data.callId;
      roleRef.current = "callee";

      setIncomingCall(data);

      setStatus(
        `Incoming call from user ${data.callerId ?? "unknown"}.`,
      );
    });

    socket.on("call:outgoing", (data: CallEvent) => {
      callIdRef.current = data.callId;
      roleRef.current = "caller";

      setStatus(
        "Calling user. Waiting for acceptance...",
      );
    });

    socket.on("call:accepted", async (data: CallEvent) => {
      callIdRef.current = data.callId;

      setInCall(true);

      if (roleRef.current !== "caller") {
        setStatus(
          "Call accepted. Waiting for the caller's offer...",
        );

        return;
      }

      try {
        await getLocalMedia();

        const pc = createPeerConnection(data.callId);

        const offer = await pc.createOffer();

        await pc.setLocalDescription(offer);

        socket.emit("webrtc:offer", {
          callId: data.callId,
          offer,
        });

        setStatus("Sending video call offer...");
      } catch (error) {
        setStatus(
          error instanceof Error
            ? error.message
            : "Could not start the call.",
        );

        socket.emit("call:end", {
          callId: data.callId,
        });

        stopMedia();
      }
    });

    socket.on("call:rejected", () => {
      stopMedia();

      setConnectionQuality("Call rejected");

      setStatus(
        "The other user rejected your call.",
      );
    });

    socket.on("call:ended", () => {
      stopMedia();

      setConnectionQuality("Call ended");

      setStatus(
        "The other user ended the call.",
      );
    });

    socket.on("call:error", (data: { message?: string }) => {
      setStatus(
        data.message || "A calling error occurred.",
      );
    });

    socket.on(
      "webrtc:offer",
      async (data: {
        callId: string;
        offer: RTCSessionDescriptionInit;
      }) => {
        try {
          callIdRef.current = data.callId;

          await getLocalMedia();

          const pc = createPeerConnection(data.callId);

          await pc.setRemoteDescription(
            new RTCSessionDescription(data.offer),
          );

          await flushPendingCandidates();

          const answer = await pc.createAnswer();

          await pc.setLocalDescription(answer);

          socket.emit("webrtc:answer", {
            callId: data.callId,
            answer,
          });

          setInCall(true);

          setStatus(
            "Answer sent. Connecting audio and video...",
          );
        } catch (error) {
          setStatus(
            error instanceof Error
              ? error.message
              : "Could not answer the call.",
          );
        }
      },
    );

    socket.on(
      "webrtc:answer",
      async (data: {
        callId: string;
        answer: RTCSessionDescriptionInit;
      }) => {
        try {
          if (data.callId !== callIdRef.current) {
            return;
          }

          const pc = peerRef.current;

          if (!pc) {
            setStatus(
              "Call connection was not initialized.",
            );

            return;
          }

          await pc.setRemoteDescription(
            new RTCSessionDescription(data.answer),
          );

          await flushPendingCandidates();

          setStatus(
            "Answer received. Establishing video connection...",
          );
        } catch (error) {
          setStatus(
            error instanceof Error
              ? error.message
              : "Could not process the answer.",
          );
        }
      },
    );

    socket.on(
      "webrtc:ice-candidate",
      async (data: {
        callId: string;
        candidate: RTCIceCandidateInit;
      }) => {
        if (data.callId !== callIdRef.current) {
          return;
        }

        const pc = peerRef.current;

        if (!pc?.remoteDescription) {
          pendingCandidatesRef.current.push(
            data.candidate,
          );

          return;
        }

        try {
          await pc.addIceCandidate(
            new RTCIceCandidate(data.candidate),
          );
        } catch (error) {
          console.error(
            "Could not add ICE candidate:",
            error,
          );
        }
      },
    );
  }, [
    token,
    getLocalMedia,
    createPeerConnection,
    flushPendingCandidates,
    stopMedia,
  ]);

  const startCall = useCallback(() => {
    const id = Number(targetUserId);

    if (!Number.isInteger(id) || id <= 0) {
      setStatus("Enter a valid target user ID.");
      return;
    }

    if (!socketRef.current?.connected) {
      setStatus(
        "Connect to the signaling server first.",
      );

      return;
    }

    socketRef.current.emit("call:invite", {
      targetUserId: id,
    });

    setStatus("Sending call invitation...");
  }, [targetUserId]);

  const acceptCall = useCallback(async () => {
    const call = incomingCall;
    const socket = socketRef.current;

    if (!call || !socket) {
      return;
    }

    try {
      await getLocalMedia();

      createPeerConnection(call.callId);

      socket.emit("call:accept", {
        callId: call.callId,
      });

      setIncomingCall(null);
      setInCall(true);

      setStatus(
        "Call accepted. Waiting for video...",
      );
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Could not access camera.",
      );

      socket.emit("call:reject", {
        callId: call.callId,
      });

      stopMedia();
    }
  }, [
    incomingCall,
    getLocalMedia,
    createPeerConnection,
    stopMedia,
  ]);

  const rejectCall = useCallback(() => {
    if (incomingCall) {
      socketRef.current?.emit("call:reject", {
        callId: incomingCall.callId,
      });
    }

    stopMedia();

    setConnectionQuality("Call rejected");

    setStatus("Call rejected.");
  }, [incomingCall, stopMedia]);

  const endCall = useCallback(() => {
    const callId = callIdRef.current;

    if (callId) {
      socketRef.current?.emit("call:end", {
        callId,
      });
    }

    stopMedia();

    setConnectionQuality("Call ended");

    setStatus("Call ended.");
  }, [stopMedia]);

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;

    if (!stream) {
      return;
    }

    const nextMuted = !muted;

    stream.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });

    setMuted(nextMuted);
  }, [muted]);

  const toggleCamera = useCallback(() => {
    const stream = localStreamRef.current;

    if (!stream) {
      return;
    }

    const nextOff = !cameraOff;

    stream.getVideoTracks().forEach((track) => {
      track.enabled = !nextOff;
    });

    setCameraOff(nextOff);
  }, [cameraOff]);

  const stopScreenShare = useCallback(async () => {
    const pc = peerRef.current;
    const cameraStream = localStreamRef.current;
    const screenStream = screenStreamRef.current;

    if (!screenStream) {
      return;
    }

    const cameraTrack =
      cameraStream?.getVideoTracks()[0];

    const videoSender = pc?.getSenders().find(
      (sender) => sender.track?.kind === "video",
    );

    try {
      if (videoSender && cameraTrack) {
        await videoSender.replaceTrack(cameraTrack);
      }
    } catch (error) {
      console.error(
        "Could not restore camera track:",
        error,
      );
    }

    screenStream.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });

    screenStreamRef.current = null;

    if (localVideoRef.current && cameraStream) {
      localVideoRef.current.srcObject = cameraStream;

      await localVideoRef.current.play().catch(() => {});
    }

    setScreenSharing(false);

    setStatus(
      "Screen sharing stopped. Camera restored.",
    );
  }, []);

  const startScreenShare = useCallback(async () => {
    const pc = peerRef.current;

    if (!inCall || !pc) {
      setStatus(
        "Join a video call before sharing your screen.",
      );

      return;
    }

    if (!navigator.mediaDevices?.getDisplayMedia) {
      setStatus(
        "Screen sharing is unavailable. Use a supported browser over localhost or HTTPS.",
      );

      return;
    }

    try {
      const screenStream =
        await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false,
        });

      const screenTrack =
        screenStream.getVideoTracks()[0];

      const videoSender = pc.getSenders().find(
        (sender) => sender.track?.kind === "video",
      );

      if (!screenTrack || !videoSender) {
        screenStream.getTracks().forEach((track) => {
          track.stop();
        });

        setStatus(
          "Could not find the video sender for screen sharing.",
        );

        return;
      }

      await videoSender.replaceTrack(screenTrack);

      screenStreamRef.current = screenStream;

      if (localVideoRef.current) {
        localVideoRef.current.srcObject =
          screenStream;

        await localVideoRef.current.play().catch(() => {});
      }

      setScreenSharing(true);

      setStatus("You are sharing your screen.");

      screenTrack.onended = () => {
        void stopScreenShare();
      };
    } catch (error) {
      setStatus(
        error instanceof Error
          ? `Screen sharing failed: ${error.message}`
          : "Screen sharing was cancelled or failed.",
      );
    }
  }, [inCall, stopScreenShare]);

  const disconnectSocket = useCallback(() => {
    if (callIdRef.current) {
      socketRef.current?.emit("call:end", {
        callId: callIdRef.current,
      });
    }

    stopMedia();

    socketRef.current?.disconnect();
    socketRef.current = null;

    setConnected(false);
    setReconnecting(false);
    setReconnectAttempts(0);

    setConnectionQuality("Disconnected");

    setStatus("Disconnected.");
  }, [stopMedia]);

  useEffect(() => {
    return () => {
      socketRef.current?.disconnect();

      peerRef.current?.close();

      screenStreamRef.current?.getTracks().forEach(
        (track) => {
          track.stop();
        },
      );

      localStreamRef.current?.getTracks().forEach(
        (track) => {
          track.stop();
        },
      );
    };
  }, []);

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-indigo-400">
            Multilingual Commenting System
          </p>

          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">
            One-to-One Video Call
          </h1>

          <p className="mt-2 text-slate-400">
            Day 60 · Reconnection and Network Failure Handling
          </p>
        </header>

        <section className="mb-6 rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <label
            className="mb-2 block text-sm font-medium"
            htmlFor="token"
          >
            Login token
          </label>

          <textarea
            id="token"
            value={token}
            onChange={(event) =>
              setToken(event.target.value)
            }
            placeholder="Paste your JWT login token here"
            rows={3}
            autoComplete="off"
            spellCheck={false}
            className="w-full resize-y rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm outline-none focus:border-indigo-500"
          />

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              onClick={connectSocket}
              disabled={connected}
              className="rounded-xl bg-indigo-600 px-5 py-3 font-semibold disabled:opacity-50"
            >
              Connect
            </button>

            <button
              onClick={disconnectSocket}
              disabled={!connected}
              className="rounded-xl border border-slate-700 px-5 py-3 font-semibold disabled:opacity-50"
            >
              Disconnect
            </button>

            <span className="self-center text-sm text-slate-400">
              {connected
                ? "Connected"
                : reconnecting
                  ? "Reconnecting..."
                  : "Not connected"}
            </span>
          </div>
        </section>

        <section className="mb-6 rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <label
            htmlFor="targetUserId"
            className="mb-2 block text-sm font-medium"
          >
            Recipient user ID
          </label>

          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              id="targetUserId"
              type="number"
              min="1"
              value={targetUserId}
              onChange={(event) =>
                setTargetUserId(event.target.value)
              }
              placeholder="Enter another user's ID"
              className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-indigo-500"
            />

            <button
              onClick={startCall}
              disabled={
                !connected ||
                inCall ||
                !!incomingCall
              }
              className="rounded-xl bg-emerald-600 px-5 py-3 font-semibold disabled:opacity-50"
            >
              Call user
            </button>
          </div>
        </section>

        {incomingCall && (
          <section className="mb-6 rounded-2xl border border-emerald-700 bg-emerald-950/50 p-5">
            <h2 className="text-lg font-bold">
              Incoming call
            </h2>

            <p className="mt-1 text-slate-300">
              User {incomingCall.callerId ?? "unknown"} is calling you.
            </p>

            <div className="mt-4 flex gap-3">
              <button
                onClick={acceptCall}
                className="rounded-xl bg-emerald-600 px-5 py-3 font-semibold"
              >
                Accept
              </button>

              <button
                onClick={rejectCall}
                className="rounded-xl bg-red-600 px-5 py-3 font-semibold"
              >
                Reject
              </button>
            </div>
          </section>
        )}

        <section className="grid gap-5 md:grid-cols-2">
          <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
            <div className="px-4 py-3 font-semibold">
              Your camera
            </div>

            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="aspect-video w-full bg-black object-cover"
            />
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
            <div className="px-4 py-3 font-semibold">
              Other participant
            </div>

            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="aspect-video w-full bg-black object-cover"
            />
          </div>
        </section>

        <section className="mt-5 rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="font-semibold">
            Call controls
          </h2>

          <p
            className="mt-2 text-sm text-slate-300"
            role="status"
          >
            {status}
          </p>

          <div className="mt-3 rounded-xl border border-slate-700 bg-slate-950 p-3">
            <p className="text-sm font-semibold">
              Connection: {connectionQuality}
            </p>

            {reconnecting && (
              <p className="mt-1 text-sm text-yellow-400">
                Reconnecting... Attempt {reconnectAttempts}
              </p>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              onClick={toggleMute}
              disabled={!inCall}
              className="rounded-xl border border-slate-700 px-4 py-3 disabled:opacity-50"
            >
              {muted
                ? "Unmute microphone"
                : "Mute microphone"}
            </button>

            <button
              onClick={toggleCamera}
              disabled={!inCall}
              className="rounded-xl border border-slate-700 px-4 py-3 disabled:opacity-50"
            >
              {cameraOff
                ? "Turn camera on"
                : "Turn camera off"}
            </button>

            <button
              onClick={
                screenSharing
                  ? stopScreenShare
                  : startScreenShare
              }
              disabled={!inCall}
              className="rounded-xl border border-slate-700 px-4 py-3 disabled:opacity-50"
            >
              {screenSharing
                ? "Stop screen sharing"
                : "Share screen"}
            </button>

            <button
              onClick={endCall}
              disabled={!inCall && !incomingCall}
              className="rounded-xl bg-red-600 px-5 py-3 font-semibold disabled:opacity-50"
            >
              End call
            </button>
          </div>
        </section>

        <p className="mt-6 text-sm leading-6 text-slate-500">
          Camera and microphone permissions are required.
          Test with two different accounts in separate
          browser sessions. Some networks require a TURN
          server in addition to STUN.
        </p>
      </div>
    </main>
  );
}
