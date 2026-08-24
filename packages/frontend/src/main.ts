import * as THREE from "three";
import { io } from "socket.io-client";
import { SocketEvent } from "@racing-game/shared";

console.log("Initializing Racing Game Frontend...");

// 1. Initialize Socket.IO connection
const socket = io("http://localhost:3001", {
  autoConnect: true,
  reconnectionAttempts: 5,
});

const statusText = document.getElementById("status-text");
if (statusText) {
  socket.on("connect", () => {
    statusText.textContent = `Connected to server! ID: ${socket.id}`;
    statusText.style.color = "#4cd964";
    console.log("Connected to WebSocket backend");
  });

  socket.on("disconnect", () => {
    statusText.textContent = "Disconnected from server. Reconnecting...";
    statusText.style.color = "#ff3b30";
    console.log("Disconnected from WebSocket backend");
  });

  socket.on("connect_error", () => {
    statusText.textContent = "Server connection failed.";
    statusText.style.color = "#ff3b30";
  });
}

// 2. Initialize Three.js Scene
const container = document.getElementById("canvas-container");
if (container) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a0c);

  const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.set(0, 5, 10);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  container.appendChild(renderer.domElement);

  // Add lights
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(10, 20, 15);
  directionalLight.castShadow = true;
  scene.add(directionalLight);

  // Create a grid helper to look like a simple track floor
  const gridHelper = new THREE.GridHelper(100, 100, 0xff3b30, 0x444444);
  gridHelper.position.y = -0.01;
  scene.add(gridHelper);

  // Create a simple placeholder vehicle (red box)
  const geometry = new THREE.BoxGeometry(2, 1, 4);
  const material = new THREE.MeshStandardMaterial({ color: 0xff3b30, roughness: 0.2, metalness: 0.8 });
  const vehicleMesh = new THREE.Mesh(geometry, material);
  vehicleMesh.castShadow = true;
  vehicleMesh.receiveShadow = true;
  scene.add(vehicleMesh);

  // Window resize handler
  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Animation Loop
  let angle = 0;
  const animate = () => {
    requestAnimationFrame(animate);

    // Make the box hover and rotate slightly to prove animation loop works
    angle += 0.01;
    vehicleMesh.position.y = Math.sin(angle) * 0.2 + 0.5;
    vehicleMesh.rotation.y = angle * 0.5;

    renderer.render(scene, camera);
  };

  animate();
}

// Button click logic
const testBtn = document.getElementById("test-btn");
if (testBtn) {
  testBtn.addEventListener("click", () => {
    console.log("Start Game clicked. Emitting CREATE_ROOM...");
    socket.emit(SocketEvent.CREATE_ROOM);
  });
}
