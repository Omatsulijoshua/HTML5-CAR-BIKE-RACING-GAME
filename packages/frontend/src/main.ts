import { Game } from "./game/Game";
import { SaveSystem } from "./game/SaveSystem";
import { io } from "socket.io-client";
import { CAREER_STAGES, CareerStageConfig } from "@racing-game/shared";

console.log("Bootstrapping Racing Game...");

// 1. Initialize Socket
const socket = io("http://localhost:3001", {
  autoConnect: true,
  reconnectionAttempts: 5,
});

const statusText = document.getElementById("status-text");
if (statusText) {
  socket.on("connect", () => {
    statusText.textContent = `ONLINE | ID: ${socket.id}`;
    statusText.style.color = "#4cd964";
  });

  socket.on("disconnect", () => {
    statusText.textContent = "OFFLINE | Reconnecting...";
    statusText.style.color = "#ff3b30";
  });

  socket.on("connect_error", () => {
    statusText.textContent = "SERVER FAIL";
    statusText.style.color = "#ff3b30";
  });
}

// 2. Initialize Save Profile & Menu
let game: Game | null = null;
const container = document.getElementById("canvas-container")!;

function refreshMenuDashboard(): void {
  const profile = SaveSystem.loadProfile();
  
  // Dashboard text updates
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

  // Draw stages selection list
  const listContainer = document.getElementById("stages-list");
  if (listContainer) {
    listContainer.innerHTML = ""; // clear
    
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
      if (isUnlocked) {
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

function startRace(stage: CareerStageConfig): void {
  // Hide menus
  const menuCard = document.getElementById("menu-card");
  if (menuCard) menuCard.style.display = "none";
  
  console.log(`Loading Career Stage: ${stage.name}`);
  
  // Clean start game engine
  if (game) {
    game.destroy();
  }

  game = new Game(container, stage, (results) => {
    // Complete callback:
    // 1. Destroy active game scene
    game?.destroy();
    game = null;
    
    // 2. Hide racing HUD
    const hud = document.getElementById("hud");
    if (hud) hud.style.display = "none";
    
    // 3. Populate and show results popup
    const popup = document.getElementById("results-popup");
    const header = document.getElementById("results-header");
    const coinsTxt = document.getElementById("reward-coins");
    const xpTxt = document.getElementById("reward-xp");
    const alert = document.getElementById("levelup-alert");

    if (popup) popup.style.display = "block";
    if (header) {
      if (results.standing === 1) {
        header.textContent = "1st PLACE!";
        header.style.color = "#39ff14";
      } else {
        header.textContent = `${results.standing}th Place`;
        header.style.color = "#ffcc00";
      }
    }
    if (coinsTxt) coinsTxt.textContent = `+${results.coins}`;
    if (xpTxt) xpTxt.textContent = `+${results.xp}`;
    if (alert) alert.style.display = results.levelUp ? "block" : "none";
  });
  
  (window as any).game = game;
}

// Results "Back to Menu" action
const backToMenuBtn = document.getElementById("back-to-menu-btn");
if (backToMenuBtn) {
  backToMenuBtn.addEventListener("click", () => {
    // Hide results
    const popup = document.getElementById("results-popup");
    if (popup) popup.style.display = "none";
    
    // Show main menus
    const menuCard = document.getElementById("menu-card");
    if (menuCard) menuCard.style.display = "block";

    // Refresh layout
    refreshMenuDashboard();
  });
}

// Initial draw
refreshMenuDashboard();
