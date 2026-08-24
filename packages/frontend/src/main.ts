import { Game } from "./game/Game";
import { io } from "socket.io-client";
import { SocketEvent } from "@racing-game/shared";

console.log("Bootstrapping Racing Game...");

// Initialize socket
const socket = io("http://localhost:3001", {
  autoConnect: true,
  reconnectionAttempts: 5,
});

const statusText = document.getElementById("status-text");
if (statusText) {
  socket.on("connect", () => {
    statusText.textContent = `Connected to server! ID: ${socket.id}`;
    statusText.style.color = "#4cd964";
  });

  socket.on("disconnect", () => {
    statusText.textContent = "Disconnected from server. Reconnecting...";
    statusText.style.color = "#ff3b30";
  });

  socket.on("connect_error", () => {
    statusText.textContent = "Server connection failed.";
    statusText.style.color = "#ff3b30";
  });
}

// Boot the 3D Game Engine
const container = document.getElementById("canvas-container");
let game: Game | null = null;

if (container) {
  game = new Game(container);
  (window as any).game = game;
}

// Bind Mobile Controls
const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;
if (isTouchDevice) {
  const mobileUI = document.getElementById("mobile-controls");
  if (mobileUI) {
    mobileUI.style.display = "flex";
  }

  const bindTouch = (
    btnId: string,
    action: "accelerate" | "brake" | "steerLeft" | "steerRight" | "nitro" | "drift"
  ) => {
    const btn = document.getElementById(btnId);
    if (btn) {
      btn.addEventListener("touchstart", (e) => {
        e.preventDefault();
        game?.input.setTouchInput(action, true);
      }, { passive: false });
      btn.addEventListener("touchend", (e) => {
        e.preventDefault();
        game?.input.setTouchInput(action, false);
      }, { passive: false });
      btn.addEventListener("touchcancel", (e) => {
        e.preventDefault();
        game?.input.setTouchInput(action, false);
      }, { passive: false });
    }
  };

  bindTouch("btn-left", "steerLeft");
  bindTouch("btn-right", "steerRight");
  bindTouch("btn-gas", "accelerate");
  bindTouch("btn-brake", "brake");
  bindTouch("btn-nitro", "nitro");
  bindTouch("btn-drift", "drift");
}

// Button actions
const testBtn = document.getElementById("test-btn");
if (testBtn) {
  testBtn.addEventListener("click", () => {
    console.log("Start Game clicked. Emitting CREATE_ROOM...");
    socket.emit(SocketEvent.CREATE_ROOM);
  });
}
