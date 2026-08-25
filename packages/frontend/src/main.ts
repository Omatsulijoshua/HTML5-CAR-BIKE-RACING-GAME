import { Game } from "./game/Game";
import { SaveSystem } from "./game/SaveSystem";
import { io, Socket } from "socket.io-client";
import { CAREER_STAGES, CareerStageConfig, SocketEvent, RoomInfo } from "@racing-game/shared";

console.log("Bootstrapping Racing Game...");

// 1. Initialize Socket.IO Client
const socket: Socket = io("http://localhost:3001", {
  autoConnect: true,
  reconnectionAttempts: 5,
});

const statusText = document.getElementById("status-text");
if (statusText) {
  socket.on("connect", () => {
    statusText.textContent = `ONLINE`;
    statusText.style.color = "#39ff14";
    socket.emit(SocketEvent.GET_ROOMS);
  });

  socket.on("disconnect", () => {
    statusText.textContent = "OFFLINE";
    statusText.style.color = "#ff3b30";
  });

  socket.on("connect_error", () => {
    statusText.textContent = "SERVER ERR";
    statusText.style.color = "#ff3b30";
  });
}

// 2. Local State Variables
let game: Game | null = null;
const container = document.getElementById("canvas-container")!;
let isHost = false;

// 3. Tab Switching Layouts
const tabCareerBtn = document.getElementById("tab-career-btn")!;
const tabMultiplayerBtn = document.getElementById("tab-multiplayer-btn")!;
const tabSettingsBtn = document.getElementById("tab-settings-btn")!;

const careerTabContent = document.getElementById("career-tab-content")!;
const multiplayerTabContent = document.getElementById("multiplayer-tab-content")!;
const settingsTabContent = document.getElementById("settings-tab-content")!;

function deactivateAllTabs(): void {
  [tabCareerBtn, tabMultiplayerBtn, tabSettingsBtn].forEach((btn) => {
    btn.style.color = "#888";
    btn.style.borderBottom = "none";
  });
  [careerTabContent, multiplayerTabContent, settingsTabContent].forEach((content) => {
    content.style.display = "none";
  });
}

tabCareerBtn.addEventListener("click", () => {
  deactivateAllTabs();
  tabCareerBtn.style.color = "#ff3b30";
  tabCareerBtn.style.borderBottom = "3px solid #ff3b30";
  careerTabContent.style.display = "block";
});

tabMultiplayerBtn.addEventListener("click", () => {
  deactivateAllTabs();
  tabMultiplayerBtn.style.color = "#ff3b30";
  tabMultiplayerBtn.style.borderBottom = "3px solid #ff3b30";
  multiplayerTabContent.style.display = "block";
  socket.emit(SocketEvent.GET_ROOMS);
});

tabSettingsBtn.addEventListener("click", () => {
  deactivateAllTabs();
  tabSettingsBtn.style.color = "#ff3b30";
  tabSettingsBtn.style.borderBottom = "3px solid #ff3b30";
  settingsTabContent.style.display = "block";
  loadSettingsUI();
});

// 4. Settings Interface Handlers
const settingGraphics = document.getElementById("setting-graphics") as HTMLSelectElement;
const settingSensitivity = document.getElementById("setting-sensitivity") as HTMLInputElement;
const sensitivityValue = document.getElementById("sensitivity-value")!;

function loadSettingsUI(): void {
  const profile = SaveSystem.loadProfile();
  
  if (settingGraphics) {
    settingGraphics.value = profile.graphicsQuality || "high";
  }
  
  if (settingSensitivity) {
    const val = profile.steeringSensitivity !== undefined ? profile.steeringSensitivity : 1.0;
    settingSensitivity.value = val.toString();
    if (sensitivityValue) {
      sensitivityValue.textContent = `${val.toFixed(1)}x`;
    }
  }
}

if (settingGraphics) {
  settingGraphics.addEventListener("change", () => {
    const profile = SaveSystem.loadProfile();
    profile.graphicsQuality = settingGraphics.value as "high" | "low";
    SaveSystem.saveProfile(profile);
    console.log(`Graphics Quality updated to: ${profile.graphicsQuality}`);
  });
}

if (settingSensitivity) {
  settingSensitivity.addEventListener("input", () => {
    const val = parseFloat(settingSensitivity.value);
    if (sensitivityValue) {
      sensitivityValue.textContent = `${val.toFixed(1)}x`;
    }
    const profile = SaveSystem.loadProfile();
    profile.steeringSensitivity = val;
    SaveSystem.saveProfile(profile);
  });
}

// 5. Update Profile & Career Stage Dashboard
function refreshMenuDashboard(): void {
  const profile = SaveSystem.loadProfile();
  
  const coinsText = document.getElementById("player-coins");
  const levelText = document.getElementById("player-level");
  const xpBar = document.getElementById("player-xp-bar");

  if (coinsText) coinsText.textContent = profile.coins.toString();
  if (levelText) levelText.textContent = profile.level.toString();
  
  if (xpBar) {
    const xpPerLevel = profile.level * 500;
    const ratio = Math.min(100, (profile.xp / xpPerLevel) * 100);
    xpBar.style.width = `${ratio}%`;
  }

  const usernameInput = document.getElementById("player-username") as HTMLInputElement;
  if (usernameInput && usernameInput.value === "Guest Racer") {
    usernameInput.value = profile.username;
  }

  // Draw stages selection list
  const listContainer = document.getElementById("stages-list");
  if (listContainer) {
    listContainer.innerHTML = "";
    
    CAREER_STAGES.forEach((stage) => {
      const isUnlocked = !stage.unlockCondition || profile.completedStages.includes(stage.unlockCondition);
      
      const item = document.createElement("div");
      item.style.display = "flex";
      item.style.justifyContent = "space-between";
      item.style.alignItems = "center";
      item.style.background = isUnlocked ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.02)";
      item.style.padding = "15px";
      item.style.borderRadius = "6px";
      item.style.border = isUnlocked ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(255,255,255,0.04)";
      item.style.opacity = isUnlocked ? "1" : "0.5";

      const infoSide = document.createElement("div");
      infoSide.innerHTML = `
        <div style="font-weight: bold; font-size: 16px; color: ${isUnlocked ? "#ffffff" : "#888"};">${stage.name}</div>
        <div style="font-size: 12px; color: #aaa; margin-top: 4px;">
          Laps: ${stage.laps} | Opponents: ${stage.aiCount} (Difficulty: ${stage.aiDifficulties.join(", ")})
        </div>
        <div style="font-size: 11px; color: #ffcc00; margin-top: 4px;">
          🥇 1st place: +${stage.rewards.coins[1]} coins | +${stage.rewards.xp[1]} XP
        </div>
      `;

      const btnSide = document.createElement("div");
      btnSide.style.display = "flex";
      btnSide.style.gap = "8px";
      btnSide.style.alignItems = "center";

      if (isUnlocked) {
        // Leaderboard query button
        const boardBtn = document.createElement("button");
        boardBtn.textContent = "🏆";
        boardBtn.style.padding = "8px 12px";
        boardBtn.style.fontSize = "13px";
        boardBtn.style.background = "#444";
        boardBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          showLeaderboard(stage.id, stage.name);
        });
        btnSide.appendChild(boardBtn);

        const raceBtn = document.createElement("button");
        raceBtn.textContent = "RACE";
        raceBtn.style.padding = "8px 16px";
        raceBtn.style.fontSize = "13px";
        raceBtn.addEventListener("click", () => {
          startRace(stage);
        });
        btnSide.appendChild(raceBtn);
      } else {
        const lockedLabel = document.createElement("div");
        lockedLabel.textContent = "🔒 LOCKED";
        lockedLabel.style.color = "#ff3b30";
        lockedLabel.style.fontSize = "12px";
        lockedLabel.style.fontWeight = "bold";
        btnSide.appendChild(lockedLabel);
      }

      item.appendChild(infoSide);
      item.appendChild(btnSide);
      listContainer.appendChild(item);
    });
  }
}

// 6. Start Race (supports Single Player & Multiplayer)
function startRace(
  stage: CareerStageConfig,
  socketInstance?: Socket,
  roomId?: string,
  playersList?: any[]
): void {
  const menuCard = document.getElementById("menu-card");
  if (menuCard) menuCard.style.display = "none";
  
  console.log(`Starting race: ${stage.name}. Multiplayer? ${!!socketInstance}`);
  
  if (game) {
    game.destroy();
  }

  game = new Game(
    container,
    stage,
    (results) => {
      game?.destroy();
      game = null;
      
      const hud = document.getElementById("hud");
      if (hud) hud.style.display = "none";
      
      // Draw detailed standings row table
      const rowsContainer = document.getElementById("results-standings-rows")!;
      if (rowsContainer) {
        rowsContainer.innerHTML = "";
        results.standingsList.forEach((entry, idx) => {
          const row = document.createElement("tr");
          row.style.borderBottom = "1px solid rgba(255,255,255,0.06)";
          if (entry.isPlayer) {
            row.style.color = "#39ff14";
            row.style.fontWeight = "bold";
          }
          row.innerHTML = `
            <td style="padding: 6px 4px;">${idx + 1}</td>
            <td style="padding: 6px 4px;">${entry.name}</td>
            <td style="padding: 6px 4px; text-transform: uppercase;">${entry.vehicleName}</td>
            <td style="padding: 6px 4px; text-align: right;">${entry.finishTime.toFixed(2)}s</td>
          `;
          rowsContainer.appendChild(row);
        });
      }

      const popup = document.getElementById("results-popup");
      const header = document.getElementById("results-header");
      const coinsTxt = document.getElementById("reward-coins");
      const xpTxt = document.getElementById("reward-xp");
      const alertLabel = document.getElementById("levelup-alert");

      if (popup) popup.style.display = "block";
      if (header) {
        if (results.standing === 1) {
          header.textContent = "1st PLACE!";
          header.style.color = "#39ff14";
        } else {
          const suffix = results.standing === 2 ? "2nd" : results.standing === 3 ? "3rd" : `${results.standing}th`;
          header.textContent = `${suffix} Place`;
          header.style.color = "#ffcc00";
        }
      }
      if (coinsTxt) coinsTxt.textContent = `+${results.coins}`;
      if (xpTxt) xpTxt.textContent = `+${results.xp}`;
      if (alertLabel) alertLabel.style.display = results.levelUp ? "block" : "none";
    },
    socketInstance,
    roomId,
    playersList
  );
  
  (window as any).game = game;
}

// Results screen "Back to Menu"
const backToMenuBtn = document.getElementById("back-to-menu-btn");
if (backToMenuBtn) {
  backToMenuBtn.addEventListener("click", () => {
    const popup = document.getElementById("results-popup");
    if (popup) popup.style.display = "none";
    
    const menuCard = document.getElementById("menu-card");
    if (menuCard) menuCard.style.display = "block";

    refreshMenuDashboard();
  });
}

// 7. Multiplayer Lobbies Client Emitters
const usernameInput = document.getElementById("player-username") as HTMLInputElement;
const createRoomBtn = document.getElementById("create-room-btn")!;

createRoomBtn.addEventListener("click", () => {
  const username = usernameInput?.value.trim() || "Guest Racer";
  console.log(`Requesting room creation for: ${username}`);
  
  const profile = SaveSystem.loadProfile();
  profile.username = username;
  SaveSystem.saveProfile(profile);
  
  socket.emit(SocketEvent.CREATE_ROOM, { username });
});

if (usernameInput) {
  usernameInput.addEventListener("change", () => {
    const username = usernameInput.value.trim() || "Guest Racer";
    SaveSystem.syncWithDatabase(username).then(() => {
      refreshMenuDashboard();
    });
  });
}

// 8. Sockets Room Event Receivers
socket.on(SocketEvent.ROOMS_LIST, (data: { rooms: RoomInfo[] }) => {
  const listContainer = document.getElementById("lobbies-list");
  if (!listContainer) return;

  listContainer.innerHTML = "";

  if (data.rooms.length === 0) {
    listContainer.innerHTML = `
      <div style="color: #888; text-align: center; padding: 20px; font-style: italic;">
        No active matches found. Create one above!
      </div>
    `;
    return;
  }

  data.rooms.forEach((room) => {
    const item = document.createElement("div");
    item.style.display = "flex";
    item.style.justifyContent = "space-between";
    item.style.alignItems = "center";
    item.style.background = "rgba(255, 255, 255, 0.05)";
    item.style.padding = "10px 15px";
    item.style.borderRadius = "4px";
    item.style.border = "1px solid rgba(255,255,255,0.08)";

    item.innerHTML = `
      <div>
        <div style="font-weight: bold; color: #ffcc00; font-family: monospace;">ROOM ID: ${room.roomId}</div>
        <div style="font-size: 12px; color: #aaa; margin-top: 2px;">
          Host: ${room.hostName} | Players: ${room.playerCount}/${room.maxPlayers}
        </div>
      </div>
    `;

    const joinBtn = document.createElement("button");
    joinBtn.textContent = "JOIN";
    joinBtn.style.padding = "6px 12px";
    joinBtn.style.fontSize = "12px";

    if (room.status !== "lobby" || room.playerCount >= room.maxPlayers) {
      joinBtn.disabled = true;
      joinBtn.textContent = room.status !== "lobby" ? "PLAYING" : "FULL";
      joinBtn.style.background = "#333";
      joinBtn.style.borderColor = "#333";
    } else {
      joinBtn.addEventListener("click", () => {
        const username = usernameInput?.value.trim() || "Guest Racer";
        socket.emit(SocketEvent.JOIN_ROOM, { roomId: room.roomId, username });
      });
    }

    item.appendChild(joinBtn);
    listContainer.appendChild(item);
  });
});

socket.on(SocketEvent.ROOM_CREATED, (data: { roomId: string; hostId: string; players: any[] }) => {
  isHost = true;
  showLobby(data.roomId, data.players);
});

socket.on(SocketEvent.ROOM_JOINED, (data: { success: boolean; error?: string; roomId?: string; hostId?: string; players?: any[] }) => {
  if (!data.success) {
    alert(`Failed to join room: ${data.error}`);
    return;
  }

  isHost = (socket.id === data.hostId);
  showLobby(data.roomId!, data.players!);
});

socket.on(SocketEvent.PLAYER_JOINED, (data: { player: any; players: any[] }) => {
  console.log(`Player joined: ${data.player.username}`);
  updatePlayersLobbyList(data.players);
});

socket.on(SocketEvent.PLAYER_READY, (data: { playerId: string; isReady: boolean; players: any[] }) => {
  console.log(`Player ${data.playerId} ready state toggled: ${data.isReady}`);
  updatePlayersLobbyList(data.players);
});

socket.on(SocketEvent.PLAYER_DISCONNECTED, (data: { playerId: string; players: any[] }) => {
  console.log(`Player ${data.playerId} disconnected`);
  updatePlayersLobbyList(data.players);
});

socket.on(SocketEvent.ROOM_CLOSED, () => {
  // If we are currently inside an active race, Game.ts handles cleanup and triggers lobby transition
  if (!game) {
    alert("Lobby room was closed by the host.");
    exitLobbyUI();
  }
});

// 9. Multiplayer Countdown Sync Handlers
socket.on(SocketEvent.RACE_STARTING, (data: { players: any[] }) => {
  console.log("Server initiated starting grid countdown!");
  const activeRoomId = document.getElementById("lobby-room-id")!.textContent || "";

  // Hide the Lobby UI popup
  document.getElementById("room-lobby-card")!.style.display = "none";

  // Boot the multiplayer race scene (stage settings stage 1)
  startRace(CAREER_STAGES[0], socket, activeRoomId, data.players);

  // Sync a local 3-second visual countdown to align with server start triggers
  runMultiplayerVisualCountdown();
});

socket.on(SocketEvent.RACE_STARTED, () => {
  console.log("Server released starting gates! Throttle unlocked.");
  if (game && game.raceStarted === false) {
    game.startRaceNow();
  }
});

function runMultiplayerVisualCountdown(): void {
  const spawnNumber = (txt: string) => {
    const el = document.createElement("div");
    el.className = "countdown-number";
    el.textContent = txt;
    document.body.appendChild(el);
    
    setTimeout(() => {
      el.remove();
    }, 980);
  };

  // Tick sequences
  spawnNumber("3");
  setTimeout(() => spawnNumber("2"), 1000);
  setTimeout(() => spawnNumber("1"), 2000);
}

// 10. Lobby UI helpers
function showLobby(roomId: string, players: any[]): void {
  document.getElementById("menu-card")!.style.display = "none";
  
  const lobbyCard = document.getElementById("room-lobby-card")!;
  lobbyCard.style.display = "block";

  document.getElementById("lobby-room-id")!.textContent = roomId;

  const startBtn = document.getElementById("lobby-start-btn")!;
  const readyBtn = document.getElementById("lobby-ready-btn")!;

  if (isHost) {
    startBtn.style.display = "block";
    readyBtn.style.display = "none";
  } else {
    startBtn.style.display = "none";
    readyBtn.style.display = "block";
    readyBtn.textContent = "READY";
    readyBtn.style.background = "";
  }

  updatePlayersLobbyList(players);
}

function updatePlayersLobbyList(players: any[]): void {
  const container = document.getElementById("lobby-players-list")!;
  container.innerHTML = "";

  let allReady = true;

  players.forEach((player) => {
    const isLocal = player.id === socket.id;
    const isPlayerHost = player.id === players[0].id;

    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.justifyContent = "space-between";
    row.style.alignItems = "center";
    row.style.background = "rgba(255,255,255,0.05)";
    row.style.padding = "10px 15px";
    row.style.borderRadius = "4px";
    row.style.border = isLocal ? "1px solid #39ff14" : "1px solid rgba(255,255,255,0.05)";

    const label = document.createElement("div");
    label.innerHTML = `
      <span style="font-weight: bold; color: #fff;">${player.username}</span>
      ${isLocal ? '<span style="font-size: 10px; color: #39ff14; margin-left: 5px;">(YOU)</span>' : ""}
      ${isPlayerHost ? '<span style="font-size: 10px; color: #ffcc00; margin-left: 5px;">(HOST)</span>' : ""}
    `;

    const statusBadge = document.createElement("div");
    if (isPlayerHost || player.isReady) {
      statusBadge.textContent = "READY";
      statusBadge.style.color = "#39ff14";
      statusBadge.style.fontSize = "12px";
      statusBadge.style.fontWeight = "bold";
    } else {
      statusBadge.textContent = "NOT READY";
      statusBadge.style.color = "#ff3b30";
      statusBadge.style.fontSize = "12px";
      statusBadge.style.fontWeight = "bold";
      allReady = false;
    }

    row.appendChild(label);
    row.appendChild(statusBadge);
    container.appendChild(row);
  });

  if (isHost && players.length > 1) {
    const startBtn = document.getElementById("lobby-start-btn") as HTMLButtonElement;
    if (startBtn) {
      startBtn.disabled = !allReady;
    }
  }
}

function exitLobbyUI(): void {
  isHost = false;

  document.getElementById("room-lobby-card")!.style.display = "none";
  document.getElementById("menu-card")!.style.display = "block";

  refreshMenuDashboard();
}

// 11. Match Lobby Button Click Handlers
const readyBtn = document.getElementById("lobby-ready-btn")!;
const leaveBtn = document.getElementById("lobby-leave-btn")!;
const startBtn = document.getElementById("lobby-start-btn")!;

readyBtn.addEventListener("click", () => {
  socket.emit(SocketEvent.READY);
  
  if (readyBtn.textContent === "READY") {
    readyBtn.textContent = "CANCEL READY";
    readyBtn.style.background = "#ff3b30";
  } else {
    readyBtn.textContent = "READY";
    readyBtn.style.background = "";
  }
});

leaveBtn.addEventListener("click", () => {
  socket.emit(SocketEvent.LEAVE_ROOM);
  exitLobbyUI();
});

startBtn.addEventListener("click", () => {
  if (isHost) {
    const activeRoomId = document.getElementById("lobby-room-id")!.textContent || "";
    console.log(`Host triggered start for room: ${activeRoomId}`);
    socket.emit(SocketEvent.SELECT_TRACK, { roomId: activeRoomId });
  }
});

// 12. Leaderboard Query Helpers
const leaderboardPopup = document.getElementById("leaderboard-popup")!;
const closeLeaderboardBtn = document.getElementById("close-leaderboard-btn")!;

function showLeaderboard(stageId: string, stageName: string): void {
  document.getElementById("menu-card")!.style.display = "none";
  leaderboardPopup.style.display = "block";
  document.getElementById("leaderboard-title")!.textContent = `${stageName} Ranks`;

  const rowsContainer = document.getElementById("leaderboard-rows")!;
  rowsContainer.innerHTML = `<tr><td colspan="3" style="text-align: center; padding: 20px; color: #888;">Loading...</td></tr>`;

  fetch(`http://localhost:3001/api/leaderboard/${stageId}`)
    .then((res) => res.json())
    .then((data: { leaderboard: Array<{ username: string; time: number }> }) => {
      rowsContainer.innerHTML = "";
      if (data.leaderboard.length === 0) {
        rowsContainer.innerHTML = `<tr><td colspan="3" style="text-align: center; padding: 20px; color: #888; font-style: italic;">No records yet! Be the first!</td></tr>`;
        return;
      }
      data.leaderboard.forEach((entry, idx) => {
        const row = document.createElement("tr");
        row.style.borderBottom = "1px solid rgba(255,255,255,0.05)";
        row.innerHTML = `
          <td style="padding: 8px 4px;">${idx + 1}</td>
          <td style="padding: 8px 4px; font-weight: bold;">${entry.username}</td>
          <td style="padding: 8px 4px; text-align: right; color: #ffcc00;">${entry.time.toFixed(2)}s</td>
        `;
        rowsContainer.appendChild(row);
      });
    })
    .catch((err) => {
      rowsContainer.innerHTML = `<tr><td colspan="3" style="text-align: center; padding: 20px; color: #ff3b30;">Failed to load leaderboard!</td></tr>`;
      console.warn("Leaderboard API error:", err);
    });
}

closeLeaderboardBtn.addEventListener("click", () => {
  leaderboardPopup.style.display = "none";
  document.getElementById("menu-card")!.style.display = "block";
});

// Initial Dashboard Sync & Draw
const initProfile = SaveSystem.loadProfile();
SaveSystem.syncWithDatabase(initProfile.username).then(() => {
  refreshMenuDashboard();
});
