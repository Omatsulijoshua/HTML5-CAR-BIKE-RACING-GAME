import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import { SocketEvent } from "@racing-game/shared";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "Racing Game server is healthy" });
});

io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Test Event
  socket.on(SocketEvent.CREATE_ROOM, () => {
    const mockRoomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    console.log(`User ${socket.id} requested to create room. Generated Room ID: ${mockRoomId}`);
    
    // Join room
    socket.join(mockRoomId);
    
    // Emit response
    socket.emit(SocketEvent.ROOM_CREATED, {
      roomId: mockRoomId,
      hostId: socket.id,
    });
  });

  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Racing Game backend server running on http://localhost:${PORT}`);
});
