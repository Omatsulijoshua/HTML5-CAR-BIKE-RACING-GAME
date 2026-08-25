import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import { SocketEvent } from "@racing-game/shared";
import { PrismaClient } from "@prisma/client";

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

// Initialize Prisma Client
const prisma = new PrismaClient();
let isDatabaseConnected = false;

prisma.$connect()
  .then(() => {
    isDatabaseConnected = true;
    console.log("PostgreSQL Database connected successfully via Prisma.");
  })
  .catch((err) => {
    console.warn("Could not connect to PostgreSQL database. Running in Memory fallback mode.");
    console.error(err.message);
  });

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    database: isDatabaseConnected ? "connected" : "fallback_mode",
    message: "Racing Game server is healthy",
  });
});

// Expose profile load route
app.post("/api/profile/load", async (req, res) => {
  const username = (req.body.username || "Guest Racer").trim();

  if (!isDatabaseConnected) {
    return res.json({
      username,
      coins: 100,
      xp: 0,
      level: 1,
      unlockedVehicles: ["starter_car", "starter_bike"],
      completedStages: [],
      bestTimes: {},
      graphicsQuality: "high",
      steeringSensitivity: 1.0,
    });
  }

  try {
    let profile = await prisma.userProfile.findUnique({
      where: { username },
      include: { bestTimes: true },
    });

    if (!profile) {
      profile = await prisma.userProfile.create({
        data: {
          username,
          unlockedVehicles: ["starter_car", "starter_bike"],
        },
        include: { bestTimes: true },
      });
    }

    // Map bestTimes array to record dictionary stages key map
    const bestTimesMap: Record<string, number> = {};
    profile.bestTimes.forEach((bt) => {
      bestTimesMap[bt.stageId] = bt.time;
    });

    return res.json({
      username: profile.username,
      coins: profile.coins,
      xp: profile.xp,
      level: profile.level,
      unlockedVehicles: profile.unlockedVehicles,
      completedStages: profile.completedStages,
      bestTimes: bestTimesMap,
      graphicsQuality: "high",
      steeringSensitivity: 1.0,
    });
  } catch (error: any) {
    console.warn(`Failed to query profile for ${username}:`, error.message);
    return res.status(500).json({ error: "Database error querying profile" });
  }
});

// Expose profile save route
app.post("/api/profile/save", async (req, res) => {
  const data = req.body;
  const username = (data.username || "Guest Racer").trim();

  if (!isDatabaseConnected) {
    return res.json({ success: true, message: "fallback_memory_saved" });
  }

  try {
    const profile = await prisma.userProfile.upsert({
      where: { username },
      update: {
        coins: Number(data.coins ?? 100),
        xp: Number(data.xp ?? 0),
        level: Number(data.level ?? 1),
        unlockedVehicles: data.unlockedVehicles ?? ["starter_car", "starter_bike"],
        completedStages: data.completedStages ?? [],
      },
      create: {
        username,
        coins: Number(data.coins ?? 100),
        xp: Number(data.xp ?? 0),
        level: Number(data.level ?? 1),
        unlockedVehicles: data.unlockedVehicles ?? ["starter_car", "starter_bike"],
        completedStages: data.completedStages ?? [],
      },
    });

    // Upsert individual stage best times
    const bestTimes = data.bestTimes || {};
    for (const [stageId, time] of Object.entries(bestTimes)) {
      await prisma.bestTime.upsert({
        where: {
          profileId_stageId: {
            profileId: profile.id,
            stageId: stageId,
          },
        },
        update: { time: Number(time) },
        create: {
          profileId: profile.id,
          stageId: stageId,
          time: Number(time),
        },
      });
    }

    return res.json({ success: true });
  } catch (error: any) {
    console.warn(`Failed to save profile for ${username}:`, error.message);
    return res.status(500).json({ error: "Database error saving profile" });
  }
});

// Expose leaderboard query route
app.get("/api/leaderboard/:stageId", async (req, res) => {
  const stageId = req.params.stageId;

  if (!isDatabaseConnected) {
    // Fallback Mock Leaderboard for offline/development test drives
    return res.json({
      leaderboard: [
        { username: "Apex Driver (AI)", time: 29.82 },
        { username: "Speed Demon (AI)", time: 31.45 },
        { username: "Turbo Racer (AI)", time: 33.12 },
      ],
    });
  }

  try {
    const times = await prisma.bestTime.findMany({
      where: { stageId },
      include: { profile: true },
      orderBy: { time: "asc" },
      take: 10,
    });

    const leaderboard = times.map((t) => ({
      username: t.profile.username,
      time: t.time,
    }));

    return res.json({ leaderboard });
  } catch (error: any) {
    console.warn(`Failed to query leaderboard for stage ${stageId}:`, error.message);
    return res.status(500).json({ error: "Database error querying leaderboard" });
  }
});

// Expose admin panel telemetry metrics route
app.get("/api/admin/metrics", async (req, res) => {
  const activeRooms = Object.keys(rooms).length;
  const activePlayers = Object.values(rooms).reduce((sum, r) => sum + r.players.length, 0);
  const memoryUsageMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
  const uptimeSeconds = Math.round(process.uptime());

  let recentMatches: any[] = [];
  if (isDatabaseConnected) {
    try {
      recentMatches = await prisma.matchHistory.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
      });
    } catch (e: any) {
      console.warn("Failed to fetch MatchHistory logs for admin panel:", e.message);
    }
  } else {
    // Mock records fallback when SQL database is disconnected
    recentMatches = [
      {
        id: "mock-id-1",
        roomId: "ROOM9A",
        hostName: "Apex Driver",
        winnerName: "Apex Driver",
        playerCount: 2,
        durationSeconds: 31.42,
        createdAt: new Date(),
      },
      {
        id: "mock-id-2",
        roomId: "ROOM4F",
        hostName: "Speed Demon",
        winnerName: "Turbo Racer",
        playerCount: 2,
        durationSeconds: 34.88,
        createdAt: new Date(Date.now() - 600000),
      },
    ];
  }

  return res.json({
    activeRooms,
    activePlayers,
    memoryUsageMB,
    uptimeSeconds,
    recentMatches,
  });
});

// Multiplayer Room State Memory
interface PlayerInfo {
  id: string;
  username: string;
  isReady: boolean;
  vehicleId: string;
  state?: {
    x: number;
    y: number;
    z: number;
    angle: number;
    speed: number;
    isNitroActive: boolean;
    isDrifting: boolean;
    vehicleId: string;
    currentLap: number;
    lastCheckpointIndex: number;
    isFinished: boolean;
    finishTime: number;
  };
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

// Log race finishes to PostgreSQL via Prisma
async function logMatchFinish(room: RoomData, winnerName: string, duration: number) {
  if (!isDatabaseConnected) return;

  try {
    const record = await prisma.matchHistory.create({
      data: {
        roomId: room.roomId,
        hostName: room.hostName,
        winnerName: winnerName,
        playerCount: room.players.length,
        durationSeconds: duration,
      },
    });
    console.log(`[SQL Log] Match History recorded with ID: ${record.id}`);
  } catch (error) {
    console.warn("Failed to log match finish record to database:", error);
  }
}

// Start 30Hz Server Broadcast Loop
setInterval(() => {
  for (const roomId of Object.keys(rooms)) {
    const room = rooms[roomId];
    if (room.status === "racing") {
      const states = room.players.map((p) => ({
        id: p.id,
        username: p.username,
        x: p.state?.x ?? 0,
        y: p.state?.y ?? 0,
        z: p.state?.z ?? 0,
        angle: p.state?.angle ?? 0,
        speed: p.state?.speed ?? 0,
        isNitroActive: p.state?.isNitroActive ?? false,
        isDrifting: p.state?.isDrifting ?? false,
        vehicleId: p.state?.vehicleId ?? "starter_car",
        currentLap: p.state?.currentLap ?? 1,
        lastCheckpointIndex: p.state?.lastCheckpointIndex ?? -1,
        isFinished: p.state?.isFinished ?? false,
        finishTime: p.state?.finishTime ?? 0,
      }));

      io.to(roomId).emit(SocketEvent.GAME_STATE, { players: states });
    }
  }
}, 33); // ~30Hz frequency

io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  // 1. Get Lobbies
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
          isReady: true,
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

    socket.emit(SocketEvent.ROOM_JOINED, {
      success: true,
      roomId,
      hostId: room.hostId,
      players: room.players,
    });

    socket.to(roomId).emit(SocketEvent.PLAYER_JOINED, {
      player: newPlayer,
      players: room.players,
    });

    broadcastLobbyList();
  });

  // 4. Toggle Ready status
  socket.on(SocketEvent.READY, () => {
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
      if (playerRoom.hostId !== socket.id) {
        playerInfo.isReady = !playerInfo.isReady;
      }
      
      io.to(playerRoom.roomId).emit(SocketEvent.PLAYER_READY, {
        playerId: socket.id,
        isReady: playerInfo.isReady,
        players: playerRoom.players,
      });
    }
  });

  // 5. Host Triggers Match Start (countdown)
  socket.on(SocketEvent.SELECT_TRACK, (data: { roomId: string }) => {
    const roomId = (data.roomId || "").toUpperCase();
    const room = rooms[roomId];

    if (room && room.hostId === socket.id && room.status === "lobby") {
      room.status = "countdown";
      broadcastLobbyList();

      console.log(`Host ${socket.id} started match for room: ${roomId}`);
      io.to(roomId).emit(SocketEvent.RACE_STARTING, { players: room.players });

      setTimeout(() => {
        if (rooms[roomId]) {
          rooms[roomId].status = "racing";
          io.to(roomId).emit(SocketEvent.RACE_STARTED);
          console.log(`Race started for room: ${roomId}`);
        }
      }, 3000);
    }
  });

  // 6. Client Broadcasts Real-time Coordinates state
  socket.on(
    SocketEvent.PLAYER_INPUT,
    (data: {
      roomId: string;
      x: number;
      y: number;
      z: number;
      angle: number;
      speed: number;
      isNitroActive: boolean;
      isDrifting: boolean;
      vehicleId: string;
      currentLap: number;
      lastCheckpointIndex: number;
      isFinished: boolean;
      finishTime: number;
    }) => {
      const roomId = (data.roomId || "").toUpperCase();
      const room = rooms[roomId];
      if (!room || (room.status !== "racing" && room.status !== "countdown")) return;

      const player = room.players.find((p) => p.id === socket.id);
      if (player) {
        // Delta velocity verification checks
        if (player.state) {
          const dx = data.x - player.state.x;
          const dz = data.z - player.state.z;
          const dist = Math.sqrt(dx * dx + dz * dz);

          if (dist > 25.0 && !data.isFinished && player.state.lastCheckpointIndex === data.lastCheckpointIndex) {
            console.warn(`Delta spike detected for player ${player.username} (${dist.toFixed(1)}m). Emitting correction.`);
            socket.emit("server:correction", {
              x: player.state.x,
              y: player.state.y,
              z: player.state.z,
            });
            return;
          }
        }

        player.state = {
          x: data.x,
          y: data.y,
          z: data.z,
          angle: data.angle,
          speed: data.speed,
          isNitroActive: data.isNitroActive,
          isDrifting: data.isDrifting,
          vehicleId: data.vehicleId,
          currentLap: data.currentLap,
          lastCheckpointIndex: data.lastCheckpointIndex,
          isFinished: data.isFinished,
          finishTime: data.finishTime,
        };

        // When a player finishes, log the match once on the database
        if (data.isFinished && room.status === "racing") {
          room.status = "finished";
          logMatchFinish(room, player.username, data.finishTime);
          broadcastLobbyList();
        }
      }
    }
  );

  // 7. Leave Room
  socket.on(SocketEvent.LEAVE_ROOM, () => {
    handlePlayerLeave(socket.id);
  });

  // 8. Disconnect
  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);
    handlePlayerLeave(socket.id);
  });

  function handlePlayerLeave(playerId: string): void {
    for (const roomId of Object.keys(rooms)) {
      const room = rooms[roomId];
      const index = room.players.findIndex((p) => p.id === playerId);

      if (index !== -1) {
        room.players.splice(index, 1);
        socket.leave(roomId);

        console.log(`User ${playerId} left room: ${roomId}`);

        if (room.hostId === playerId) {
          console.log(`Host left. Closing room: ${roomId}`);
          io.to(roomId).emit(SocketEvent.ROOM_CLOSED, { roomId });

          const roomSockets = io.sockets.adapter.rooms.get(roomId);
          if (roomSockets) {
            for (const socketId of roomSockets) {
              const clientSocket = io.sockets.sockets.get(socketId);
              if (clientSocket) clientSocket.leave(roomId);
            }
          }

          delete rooms[roomId];
        } else {
          io.to(roomId).emit(SocketEvent.PLAYER_DISCONNECTED, {
            playerId,
            players: room.players,
          });
        }

        broadcastLobbyList();
        break;
      }
    }
  }
});

httpServer.listen(PORT, () => {
  console.log(`Racing Game backend server running on http://localhost:${PORT}`);
});
