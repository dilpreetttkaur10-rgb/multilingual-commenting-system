const { io } = require("socket.io-client");

const socket = io("http://localhost:5000", {
  auth: { token: process.env.SOCKET_TEST_TOKEN },
  transports: ["websocket"]
});

socket.on("connect", () => {
  console.log("Socket connected successfully:", socket.id);
  socket.disconnect();
});

socket.on("connect_error", (err) => {
  console.log("Socket connection failed:", err.message);
  process.exitCode = 1;
  socket.disconnect();
});
