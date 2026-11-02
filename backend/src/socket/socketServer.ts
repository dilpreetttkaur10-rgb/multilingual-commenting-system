
import { createHash, randomUUID } from "crypto";
import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import jwt, { JwtPayload } from "jsonwebtoken";
import { prisma } from "../utils/prisma";

interface AuthenticatedSocket extends Socket {
  userId?: number;
}

interface ActiveCall {
  callId: string;
  callerId: number;
  calleeId: number;
  status: "ringing" | "accepted";
}

interface MeetingParticipant {
  userId: number;
  socketId: string;
}

interface RoomParticipant {
  userId: number;
  socketId: string;
}

const onlineUsers = new Map<number, Set<string>>();
const activeCalls = new Map<string, ActiveCall>();

const meetingRooms = new Map<string, Map<string, RoomParticipant>>();
const meetingRoomHosts = new Map<string, number>();
const lockedMeetingRooms = new Set<string>();

function addOnlineUser(userId: number, socketId: string): void {
  let sockets = onlineUsers.get(userId);

  if (!sockets) {
    sockets = new Set<string>();
    onlineUsers.set(userId, sockets);
  }

  sockets.add(socketId);
}

function removeOnlineUser(userId: number, socketId: string): void {
  const sockets = onlineUsers.get(userId);
  if (!sockets) return;

  sockets.delete(socketId);

  if (sockets.size === 0) {
    onlineUsers.delete(userId);
  }
}

function emitToUser(
  io: Server,
  userId: number,
  event: string,
  data: unknown
): void {
  const sockets = onlineUsers.get(userId);
  if (!sockets) return;

  for (const socketId of sockets) {
    io.to(socketId).emit(event, data);
  }
}

function getRoomParticipants(roomId: string): MeetingParticipant[] {
  const room = meetingRooms.get(roomId);
  if (!room) return [];

  return Array.from(room.values()).map((participant) => ({
    userId: participant.userId,
    socketId: participant.socketId,
  }));
}

function cleanupMeetingRoom(roomId: string): void {
  const room = meetingRooms.get(roomId);

  if (!room || room.size === 0) {
    meetingRooms.delete(roomId);
    meetingRoomHosts.delete(roomId);
    lockedMeetingRooms.delete(roomId);
  }
}

function transferMeetingHost(io: Server, roomId: string): void {
  const room = meetingRooms.get(roomId);

  if (!room || room.size === 0) {
    cleanupMeetingRoom(roomId);
    return;
  }

  const nextHost = room.values().next().value as
    | RoomParticipant
    | undefined;

  if (!nextHost) {
    cleanupMeetingRoom(roomId);
    return;
  }

  meetingRoomHosts.set(roomId, nextHost.userId);

  io.to(roomId).emit("room:host-changed", {
    roomId,
    hostUserId: nextHost.userId,
    hostSocketId: nextHost.socketId,
  });

  console.log(
    `Meeting ${roomId} host transferred to user ${nextHost.userId}`
  );
}

export function createSocketServer(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: "http://localhost:3000",
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  // SOCKET AUTHENTICATION
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;

      if (typeof token !== "string" || !token.trim()) {
        return next(new Error("Authentication token is required."));
      }

      const secret = process.env.JWT_SECRET;

      if (!secret) {
        console.error("JWT_SECRET is missing from the environment.");
        return next(new Error("Server authentication is not configured."));
      }

      const decoded = jwt.verify(token, secret);

      if (typeof decoded === "string") {
        return next(new Error("Invalid authentication token."));
      }

      const payload = decoded as JwtPayload;
      const userId = Number(payload.userId ?? payload.id);

      if (!Number.isSafeInteger(userId) || userId <= 0) {
        return next(new Error("Invalid user in authentication token."));
      }

      const sessionTokenHash = createHash("sha256")
        .update(token)
        .digest("hex");

      const session = await prisma.userSession.findFirst({
        where: {
          userId,
          sessionTokenHash,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        select: {
          id: true,
          userId: true,
        },
      });

      if (!session) {
        return next(
          new Error("Your session is invalid or has expired.")
        );
      }

      (socket as AuthenticatedSocket).userId = session.userId;

      next();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";

      console.error("Socket authentication failed:", message);
      next(new Error("Socket authentication failed."));
    }
  });

  io.on("connection", (rawSocket) => {
    const socket = rawSocket as AuthenticatedSocket;
    const userId = socket.userId;

    if (!userId) {
      socket.disconnect(true);
      return;
    }

    addOnlineUser(userId, socket.id);

    console.log(
      `User ${userId} connected to Socket.IO (${socket.id})`
    );

    socket.emit("socket:connected", {
      userId,
      socketId: socket.id,
    });

    // ONE-TO-ONE CALL INVITATION
    socket.on(
      "call:invite",
      (data: {
        targetUserId?: number | string;
        calleeId?: number | string;
      }) => {
        const rawRecipientId = data?.targetUserId ?? data?.calleeId;

        const calleeId =
          rawRecipientId === undefined ||
          rawRecipientId === null ||
          String(rawRecipientId).trim() === ""
            ? NaN
            : Number(rawRecipientId);

        if (
          !Number.isSafeInteger(calleeId) ||
          calleeId <= 0 ||
          calleeId === userId
        ) {
          socket.emit("call:error", {
            message: "Invalid recipient.",
          });
          return;
        }

        if (!onlineUsers.has(calleeId)) {
          socket.emit("call:error", {
            message: "The recipient is not online.",
          });
          return;
        }

        const recipientBusy = Array.from(activeCalls.values()).some(
          (call) =>
            call.status === "accepted" &&
            (call.callerId === calleeId ||
              call.calleeId === calleeId)
        );

        if (recipientBusy) {
          socket.emit("call:error", {
            message: "The recipient is already in a call.",
          });
          return;
        }

        const callerBusy = Array.from(activeCalls.values()).some(
          (call) =>
            call.status === "accepted" &&
            (call.callerId === userId ||
              call.calleeId === userId)
        );

        if (callerBusy) {
          socket.emit("call:error", {
            message: "You are already in a call.",
          });
          return;
        }

        const callId = randomUUID();

        const call: ActiveCall = {
          callId,
          callerId: userId,
          calleeId,
          status: "ringing",
        };

        activeCalls.set(callId, call);

        emitToUser(io, calleeId, "call:incoming", {
          callId,
          callerId: userId,
        });

        socket.emit("call:outgoing", {
          callId,
          calleeId,
        });

        console.log(`User ${userId} called user ${calleeId}`);
      }
    );

    // ACCEPT CALL
    socket.on("call:accept", (data: { callId?: string }) => {
      const callId = data?.callId;
      const call = callId ? activeCalls.get(callId) : undefined;

      if (!call || call.calleeId !== userId) {
        socket.emit("call:error", {
          message: "Call not found or you cannot accept it.",
        });
        return;
      }

      if (call.status !== "ringing") {
        socket.emit("call:error", {
          message: "This call is no longer ringing.",
        });
        return;
      }

      call.status = "accepted";

      emitToUser(io, call.callerId, "call:accepted", {
        callId,
        calleeId: userId,
      });

      socket.emit("call:accepted", {
        callId,
        callerId: call.callerId,
      });
    });

    // REJECT CALL
    socket.on("call:reject", (data: { callId?: string }) => {
      const callId = data?.callId;
      const call = callId ? activeCalls.get(callId) : undefined;

      if (
        !call ||
        (call.calleeId !== userId && call.callerId !== userId)
      ) {
        return;
      }

      activeCalls.delete(call.callId);

      const otherUserId =
        call.callerId === userId ? call.calleeId : call.callerId;

      emitToUser(io, otherUserId, "call:rejected", {
        callId: call.callId,
        userId,
      });

      socket.emit("call:rejected", {
        callId: call.callId,
      });
    });

    // WEBRTC OFFER
    socket.on(
      "webrtc:offer",
      (data: { callId?: string; offer?: unknown }) => {
        const callId = data?.callId;
        const call = callId ? activeCalls.get(callId) : undefined;

        if (
          !call ||
          call.status !== "accepted" ||
          call.callerId !== userId ||
          data.offer === undefined
        ) {
          socket.emit("call:error", {
            message: "Invalid WebRTC offer.",
          });
          return;
        }

        emitToUser(io, call.calleeId, "webrtc:offer", {
          callId,
          offer: data.offer,
          callerId: userId,
        });
      }
    );

    // WEBRTC ANSWER
    socket.on(
      "webrtc:answer",
      (data: { callId?: string; answer?: unknown }) => {
        const callId = data?.callId;
        const call = callId ? activeCalls.get(callId) : undefined;

        if (
          !call ||
          call.status !== "accepted" ||
          call.calleeId !== userId ||
          data.answer === undefined
        ) {
          socket.emit("call:error", {
            message: "Invalid WebRTC answer.",
          });
          return;
        }

        emitToUser(io, call.callerId, "webrtc:answer", {
          callId,
          answer: data.answer,
          calleeId: userId,
        });
      }
    );

    // WEBRTC ICE CANDIDATES
    socket.on(
      "webrtc:ice-candidate",
      (data: { callId?: string; candidate?: unknown }) => {
        const callId = data?.callId;
        const call = callId ? activeCalls.get(callId) : undefined;

        if (
          !call ||
          call.status !== "accepted" ||
          data.candidate === undefined
        ) {
          return;
        }

        if (call.callerId === userId) {
          emitToUser(io, call.calleeId, "webrtc:ice-candidate", {
            callId,
            candidate: data.candidate,
          });
        } else if (call.calleeId === userId) {
          emitToUser(io, call.callerId, "webrtc:ice-candidate", {
            callId,
            candidate: data.candidate,
          });
        }
      }
    );

    // END CALL
    socket.on("call:end", (data: { callId?: string }) => {
      const callId = data?.callId;
      const call = callId ? activeCalls.get(callId) : undefined;

      if (
        !call ||
        (call.callerId !== userId && call.calleeId !== userId)
      ) {
        return;
      }

      activeCalls.delete(call.callId);

      const otherUserId =
        call.callerId === userId ? call.calleeId : call.callerId;

      emitToUser(io, otherUserId, "call:ended", {
        callId: call.callId,
        userId,
      });

      socket.emit("call:ended", {
        callId: call.callId,
      });
    });

    // CREATE MEETING ROOM
    socket.on("room:create", () => {
      const roomId = randomUUID();
      const room = new Map<string, RoomParticipant>();

      room.set(socket.id, {
        userId,
        socketId: socket.id,
      });

      meetingRooms.set(roomId, room);
      meetingRoomHosts.set(roomId, userId);
      lockedMeetingRooms.delete(roomId);

      socket.join(roomId);

      socket.emit("room:created", {
        roomId,
        hostUserId: userId,
        locked: false,
        participants: getRoomParticipants(roomId),
      });

      console.log(`User ${userId} created meeting ${roomId}`);
    });

    // JOIN MEETING ROOM
    socket.on("room:join", (data: { roomId?: string }) => {
      const roomId = String(data?.roomId ?? "").trim();

      if (!roomId) {
        socket.emit("room:error", {
          message: "Please provide a meeting room ID.",
        });
        return;
      }

      const room = meetingRooms.get(roomId);

      if (!room) {
        socket.emit("room:error", {
          message: "Meeting room not found.",
        });
        return;
      }

      if (room.has(socket.id)) {
        socket.emit("room:joined", {
          roomId,
          hostUserId: meetingRoomHosts.get(roomId),
          locked: lockedMeetingRooms.has(roomId),
          participants: getRoomParticipants(roomId),
        });
        return;
      }

      if (lockedMeetingRooms.has(roomId)) {
        socket.emit("room:error", {
          message: "This meeting is locked by the host.",
        });
        return;
      }

      const userAlreadyJoined = Array.from(room.values()).some(
        (participant) => participant.userId === userId
      );

      if (userAlreadyJoined) {
        socket.emit("room:error", {
          message: "You have already joined this meeting.",
        });
        return;
      }

      const existingParticipants = getRoomParticipants(roomId);

      room.set(socket.id, {
        userId,
        socketId: socket.id,
      });

      socket.join(roomId);

      socket.emit("room:joined", {
        roomId,
        hostUserId: meetingRoomHosts.get(roomId),
        locked: lockedMeetingRooms.has(roomId),
        participants: existingParticipants,
      });

      socket.to(roomId).emit("room:participant-joined", {
        roomId,
        userId,
        socketId: socket.id,
      });

      console.log(`User ${userId} joined meeting ${roomId}`);
    });

    // HOST LOCK / UNLOCK MEETING
    socket.on(
      "room:lock",
      (data: { roomId?: string; locked?: boolean }) => {
        const roomId = String(data?.roomId ?? "").trim();
        const room = meetingRooms.get(roomId);

        if (!room || !room.has(socket.id)) {
          socket.emit("room:error", {
            message: "You are not a participant in this meeting.",
          });
          return;
        }

        if (meetingRoomHosts.get(roomId) !== userId) {
          socket.emit("room:error", {
            message: "Only the host can lock or unlock this meeting.",
          });
          return;
        }

        if (typeof data?.locked !== "boolean") {
          socket.emit("room:error", {
            message: "Lock status must be true or false.",
          });
          return;
        }

        if (data.locked) {
          lockedMeetingRooms.add(roomId);
        } else {
          lockedMeetingRooms.delete(roomId);
        }

        io.to(roomId).emit("room:locked", {
          roomId,
          locked: data.locked,
          hostUserId: userId,
        });

        console.log(
          `Meeting ${roomId} ${
            data.locked ? "locked" : "unlocked"
          } by host ${userId}`
        );
      }
    );

    // HOST REMOVE PARTICIPANT
    socket.on(
      "room:remove-participant",
      (data: { roomId?: string; targetSocketId?: string }) => {
        const roomId = String(data?.roomId ?? "").trim();
        const targetSocketId = String(
          data?.targetSocketId ?? ""
        ).trim();

        const room = meetingRooms.get(roomId);

        if (!room || !room.has(socket.id)) {
          socket.emit("room:error", {
            message: "You are not a participant in this meeting.",
          });
          return;
        }

        if (meetingRoomHosts.get(roomId) !== userId) {
          socket.emit("room:error", {
            message: "Only the host can remove participants.",
          });
          return;
        }

        if (!targetSocketId || targetSocketId === socket.id) {
          socket.emit("room:error", {
            message: "Invalid participant to remove.",
          });
          return;
        }

        const targetParticipant = room.get(targetSocketId);

        if (!targetParticipant) {
          socket.emit("room:error", {
            message: "Participant not found in this meeting.",
          });
          return;
        }

        if (targetParticipant.userId === meetingRoomHosts.get(roomId)) {
          socket.emit("room:error", {
            message: "The host cannot be removed.",
          });
          return;
        }

        const targetSocket = io.sockets.sockets.get(targetSocketId);

        room.delete(targetSocketId);

        if (targetSocket) {
          targetSocket.leave(roomId);

          targetSocket.emit("room:participant-removed", {
            roomId,
            message: "The host removed you from this meeting.",
          });
        }

        socket.to(roomId).emit("room:participant-left", {
          roomId,
          userId: targetParticipant.userId,
          socketId: targetSocketId,
        });

        cleanupMeetingRoom(roomId);

        console.log(
          `Host ${userId} removed user ${targetParticipant.userId} from meeting ${roomId}`
        );
      }
    );

    // ROOM CHAT MESSAGE
    socket.on(
      "room:message",
      (data: { roomId?: string; message?: string }) => {
        const roomId = String(data?.roomId ?? "").trim();
        const message = String(data?.message ?? "").trim();

        const room = meetingRooms.get(roomId);

        if (!room || !room.has(socket.id)) {
          socket.emit("room:error", {
            message: "You are not a participant in this meeting.",
          });
          return;
        }

        if (!message || message.length > 1000) {
          socket.emit("room:error", {
            message: "Message must contain 1 to 1000 characters.",
          });
          return;
        }

        socket.to(roomId).emit("room:message", {
          roomId,
          userId,
          socketId: socket.id,
          message,
          timestamp: new Date().toISOString(),
        });
      }
    );

    // RAISE HAND
    socket.on(
      "room:raise-hand",
      (data: { roomId?: string; raised?: boolean }) => {
        const roomId = String(data?.roomId ?? "").trim();
        const room = meetingRooms.get(roomId);

        if (!room || !room.has(socket.id)) {
          socket.emit("room:error", {
            message: "You are not a participant in this meeting.",
          });
          return;
        }

        if (typeof data?.raised !== "boolean") {
          socket.emit("room:error", {
            message: "Raise hand status must be true or false.",
          });
          return;
        }

        socket.to(roomId).emit("room:raise-hand", {
          roomId,
          userId,
          socketId: socket.id,
          raised: data.raised,
        });
      }
    );

    // LEAVE MEETING ROOM
    socket.on("room:leave", (data: { roomId?: string }) => {
      const roomId = String(data?.roomId ?? "").trim();
      const room = meetingRooms.get(roomId);

      if (!room || !room.has(socket.id)) {
        return;
      }

      const wasHost = meetingRoomHosts.get(roomId) === userId;

      room.delete(socket.id);
      socket.leave(roomId);

      socket.to(roomId).emit("room:participant-left", {
        roomId,
        userId,
        socketId: socket.id,
      });

      if (wasHost) {
        transferMeetingHost(io, roomId);
      }

      cleanupMeetingRoom(roomId);

      socket.emit("room:left", { roomId });

      console.log(`User ${userId} left meeting ${roomId}`);
    });

    // DISCONNECT CLEANUP
    socket.on("disconnect", () => {
      removeOnlineUser(userId, socket.id);

      for (const [callId, call] of activeCalls.entries()) {
        if (
          call.callerId !== userId &&
          call.calleeId !== userId
        ) {
          continue;
        }

        activeCalls.delete(callId);

        const otherUserId =
          call.callerId === userId ? call.calleeId : call.callerId;

        emitToUser(io, otherUserId, "call:ended", {
          callId,
          userId,
          reason: "disconnected",
        });
      }

      for (const [roomId, room] of meetingRooms.entries()) {
        if (!room.has(socket.id)) {
          continue;
        }

        const wasHost = meetingRoomHosts.get(roomId) === userId;

        room.delete(socket.id);

        socket.to(roomId).emit("room:participant-left", {
          roomId,
          userId,
          socketId: socket.id,
        });

        if (wasHost) {
          transferMeetingHost(io, roomId);
        }

        cleanupMeetingRoom(roomId);
      }

      console.log(
        `User ${userId} disconnected from Socket.IO (${socket.id})`
      );
    });
  });

  return io;
}
