
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
  const [status, setStatus] = useState(
    "Enter your login token to connect.",
  );
  const [incomingCall, setIncomingCall] =
    useState<CallEvent | null>(null);
  const [inCall, setInCall] = useState(false);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const callIdRef = useRef<string | null>(null);
  const roleRef = useRef<"caller" | "callee" | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

  const stopMedia = useCallback(() => {
    peerRef.current?.close();
    peerRef.current = null;

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
      if (pc.connectionState === "connected") {
        setStatus("Video call connected.");
      } else if (pc.connectionState === "connecting") {
        setStatus("Connecting audio and video...");
      } else if (
        pc.connectionState === "failed" ||
        pc.connectionState === "disconnected"
      ) {
        setStatus(
          `Connection ${pc.connectionState}. Check your network.`,
        );
      }
    };

    return pc;
  }, []);

  const flushPendingCandidates = useCallback(async () => {
    const pc = peerRef.current;

    if (!pc?.remoteDescription) return;

    const candidates = [...pendingCandidatesRef.current];
    pendingCandidatesRef.current = [];

    for (const candidate of candidates) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
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
    });

    socketRef.current = socket;
    setStatus("Connecting to the signaling server...");

    socket.on("connect", () => {
      setConnected(true);
      setStatus("Connected. Waiting for authentication...");
    });

    socket.on("socket:ready", () => {
      setConnected(true);
      setStatus("Authenticated. You can now make calls.");
    });

    socket.on("connect_error", (error) => {
      setConnected(false);
      setStatus(`Connection failed: ${error.message}`);
    });

    socket.on("disconnect", () => {
      setConnected(false);
      setStatus("Disconnected from signaling server.");
    });

    socket.on("call:incoming", (data: CallEvent) => {
      callIdRef.current = data.callId;
      roleRef.current = "callee";
      setIncomingCall(data);
      setStatus(`Incoming call from user ${data.callerId ?? "unknown"}.`);
    });

    socket.on("call:outgoing", (data: CallEvent) => {
      callIdRef.current = data.callId;
      roleRef.current = "caller";
      setStatus("Calling user. Waiting for acceptance...");
    });

    socket.on("call:accepted", async (data: CallEvent) => {
      callIdRef.current = data.callId;
      setInCall(true);

      if (roleRef.current !== "caller") {
        setStatus("Call accepted. Waiting for the caller's offer...");
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

        socket.emit("call:end", { callId: data.callId });
        stopMedia();
      }
    });

    socket.on("call:rejected", () => {
      stopMedia();
      setStatus("The other user rejected your call.");
    });

    socket.on("call:ended", () => {
      stopMedia();
      setStatus("The other user ended the call.");
    });

    socket.on("call:error", (data: { message?: string }) => {
      setStatus(data.message || "A calling error occurred.");
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
          setStatus("Answer sent. Connecting audio and video...");
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
          if (data.callId !== callIdRef.current) return;

          const pc = peerRef.current;

          if (!pc) {
            setStatus("Call connection was not initialized.");
            return;
          }

          await pc.setRemoteDescription(
            new RTCSessionDescription(data.answer),
          );

          await flushPendingCandidates();
          setStatus("Answer received. Establishing video connection...");
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
        if (data.callId !== callIdRef.current) return;

        const pc = peerRef.current;

        if (!pc?.remoteDescription) {
          pendingCandidatesRef.current.push(data.candidate);
          return;
        }

        try {
          await pc.addIceCandidate(
            new RTCIceCandidate(data.candidate),
          );
        } catch (error) {
          console.error("Could not add ICE candidate:", error);
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
      setStatus("Connect to the signaling server first.");
      return;
    }

    socketRef.current.emit("call:invite", { targetUserId: id });
    setStatus("Sending call invitation...");
  }, [targetUserId]);

  const acceptCall = useCallback(async () => {
    const call = incomingCall;
    const socket = socketRef.current;

    if (!call || !socket) return;

    try {
      await getLocalMedia();
      createPeerConnection(call.callId);

      socket.emit("call:accept", { callId: call.callId });

      setIncomingCall(null);
      setInCall(true);
      setStatus("Call accepted. Waiting for video...");
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Could not access camera.",
      );

      socket.emit("call:reject", { callId: call.callId });
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
    setStatus("Call rejected.");
  }, [incomingCall, stopMedia]);

  const endCall = useCallback(() => {
    const callId = callIdRef.current;

    if (callId) {
      socketRef.current?.emit("call:end", { callId });
    }

    stopMedia();
    setStatus("Call ended.");
  }, [stopMedia]);

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;

    const nextMuted = !muted;

    stream.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });

    setMuted(nextMuted);
  }, [muted]);

  const toggleCamera = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;

    const nextOff = !cameraOff;

    stream.getVideoTracks().forEach((track) => {
      track.enabled = !nextOff;
    });

    setCameraOff(nextOff);
  }, [cameraOff]);

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
    setStatus("Disconnected.");
  }, [stopMedia]);

  useEffect(() => {
    return () => {
      socketRef.current?.disconnect();
      peerRef.current?.close();

      localStreamRef.current?.getTracks().forEach((track) => {
        track.stop();
      });
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
            Day 55 · WebRTC + Socket.IO
          </p>
        </header>

        <section className="mb-6 rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <label className="mb-2 block text-sm font-medium" htmlFor="token">
            Login token
          </label>
          <textarea
            id="token"
            value={token}
            onChange={(event) => setToken(event.target.value)}
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
              {connected ? "Connected" : "Not connected"}
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
              onChange={(event) => setTargetUserId(event.target.value)}
              placeholder="Enter another user's ID"
              className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-indigo-500"
            />
            <button
              onClick={startCall}
              disabled={!connected || inCall || !!incomingCall}
              className="rounded-xl bg-emerald-600 px-5 py-3 font-semibold disabled:opacity-50"
            >
              Call user
            </button>
          </div>
        </section>

        {incomingCall && (
          <section className="mb-6 rounded-2xl border border-emerald-700 bg-emerald-950/50 p-5">
            <h2 className="text-lg font-bold">Incoming call</h2>
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
            <div className="px-4 py-3 font-semibold">Your camera</div>
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="aspect-video w-full bg-black object-cover"
            />
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
            <div className="px-4 py-3 font-semibold">Other participant</div>
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="aspect-video w-full bg-black object-cover"
            />
          </div>
        </section>

        <section className="mt-5 rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="font-semibold">Call controls</h2>
          <p className="mt-2 text-sm text-slate-300" role="status">
            {status}
          </p>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              onClick={toggleMute}
              disabled={!inCall}
              className="rounded-xl border border-slate-700 px-4 py-3 disabled:opacity-50"
            >
              {muted ? "Unmute microphone" : "Mute microphone"}
            </button>
            <button
              onClick={toggleCamera}
              disabled={!inCall}
              className="rounded-xl border border-slate-700 px-4 py-3 disabled:opacity-50"
            >
              {cameraOff ? "Turn camera on" : "Turn camera off"}
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
          Camera and microphone permissions are required. Test with two
          different accounts in separate browser sessions. Some networks
          require a TURN server in addition to STUN.
        </p>
      </div>
    </main>
  );
}
