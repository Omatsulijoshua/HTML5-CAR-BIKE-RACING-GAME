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

// Multiplayer Room State Memory
interface PlayerInfo {
  id: string;
  username: string;
  isReady: boolean;
  vehicleId: string;
}

interface RoomData {
  roomId: string;
  hostId: string;
  hostName: string;
  players: PlayerInfo[];
  status: "lobby" | "countdown" | "racing" | "finished";
  maxPlayers: number;
}

const rooms: Record<string, RoomData> = {};

function broadcastLobbyList(): void {
  const list = Object.values(rooms).map((r) => ({
    roomId: r.roomId,
    hostName: r.hostName,
    playerCount: r.players.length,
    maxPlayers: r.maxPlayers,
    status: r.status,
  }));
  io.emit(SocketEvent.ROOMS_LIST, { rooms: list });
}

io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  // 1. Get Rooms List
  socket.on(SocketEvent.GET_ROOMS, () => {
    const list = Object.values(rooms).map((r) => ({
      roomId: r.roomId,
      hostName: r.hostName,
      playerCount: r.players.length,
      maxPlayers: r.maxPlayers,
      status: r.status,
    }));
    socket.emit(SocketEvent.ROOMS_LIST, { rooms: list });
  });

  // 2. Create Room
  socket.on(SocketEvent.CREATE_ROOM, (data: { username: string }) => {
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    console.log(`User ${socket.id} (${data.username}) created room: ${roomId}`);

    rooms[roomId] = {
      roomId,
      hostId: socket.id,
      hostName: data.username || "Guest Host",
      players: [
        {
          id: socket.id,
          username: data.username || "Guest Host",
          isReady: true, // host is ready by default
          vehicleId: "starter_car",
        },
      ],
      status: "lobby",
      maxPlayers: 2,
    };

    socket.join(roomId);
    socket.emit(SocketEvent.ROOM_CREATED, {
      roomId,
      hostId: socket.id,
      players: rooms[roomId].players,
    });

    broadcastLobbyList();
  });

  // 3. Join Room
  socket.on(SocketEvent.JOIN_ROOM, (data: { roomId: string; username: string }) => {
    const roomId = (data.roomId || "").toUpperCase();
    console.log(`User ${socket.id} (${data.username}) attempting to join room: ${roomId}`);

    const room = rooms[roomId];
    if (!room) {
      socket.emit(SocketEvent.ROOM_JOINED, {
        success: false,
        error: "Room not found",
      });
      return;
    }

    if (room.players.length >= room.maxPlayers) {
      socket.emit(SocketEvent.ROOM_JOINED, {
        success: false,
        error: "Room is full",
      });
      return;
    }

    if (room.status !== "lobby") {
      socket.emit(SocketEvent.ROOM_JOINED, {
        success: false,
        error: "Race already in progress",
      });
      return;
    }

    const newPlayer: PlayerInfo = {
      id: socket.id,
      username: data.username || `Racer ${room.players.length + 1}`,
      isReady: false,
      vehicleId: "starter_car",
    };

    room.players.push(newPlayer);
    socket.join(roomId);

    // Reply success to the joiner
    socket.emit(SocketEvent.ROOM_JOINED, {
      success: true,
      roomId,
      hostId: room.hostId,
      players: room.players,
    });

    // Notify other members
    socket.to(roomId).emit(SocketEvent.PLAYER_JOINED, {
      player: newPlayer,
      players: room.players,
    });

    broadcastLobbyList();
  });

  // 4. Toggle Ready
  socket.on(SocketEvent.READY, () => {
    // Find room of player
    let playerRoom: RoomData | null = null;
    let playerInfo: PlayerInfo | null = null;

    for (const room of Object.values(rooms)) {
      const found = room.players.find((p) => p.id === socket.id);
      if (found) {
        playerRoom = room;
        playerInfo = found;
        break;
      }
    }

    if (playerRoom && playerInfo) {
      // Toggle readiness (hosts are always ready, guests toggle)
      if (playerRoom.hostId !== socket.id) {
        playerInfo.isReady = !playerInfo.isReady;
      }
      
      console.log(`User ${socket.id} toggled ready status to: ${playerInfo.isReady}`);
      io.to(playerRoom.roomId).emit(SocketEvent.PLAYER_READY, {
        playerId: socket.id,
        isReady: playerInfo.isReady,
        players: playerRoom.players,
      });
    }
  });

  // 5. Leave Room
  socket.on(SocketEvent.LEAVE_ROOM, () => {
    handlePlayerLeave(socket.id);
  });

  // 6. Handle Disconnection
  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);
    handlePlayerLeave(socket.id);
  });

  function handlePlayerLeave(playerId: string): void {
    for (const roomId of Object.keys(rooms)) {
      const room = rooms[roomId];
      const index = room.players.findIndex((p) => p.id === playerId);

      if (index !== -1) {
        // Remove player from room
        room.players.splice(index, 1);
        socket.leave(roomId);

        console.log(`User ${playerId} left room: ${roomId}`);

        if (room.hostId === playerId) {
          // Host left! Terminate room
          console.log(`Host left. Closing room: ${roomId}`);
          io.to(roomId).emit(SocketEvent.ROOM_CLOSED, { roomId });
          
          // Force all remaining socket clients in room to leave
          const roomSockets = io.sockets.adapter.rooms.get(roomId);
          if (roomSockets) {
            for (const socketId of roomSockets) {
              const clientSocket = io.sockets.sockets.get(socketId);
              if (clientSocket) clientSocket.leave(roomId);
            }
          }

          delete rooms[roomId];
        } else {
          // Notify other players
          io.to(roomId).emit(SocketEvent.PLAYER_DISCONNECTED, {
            playerId,
            players: room.players,
          });
        }

        broadcastLobbyList();
        break; // socket can only be in 1 room at a time
      }
    }
  }
});

httpServer.listen(PORT, () => {
  console.log(`Racing Game backend server running on http://localhost:${PORT}`);
});
