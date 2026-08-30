# 🏎️ HTML5 3D Car & Bike Racing Game

A high-performance, real-time multiplayer 3D arcade racing game built using Three.js, Express, Socket.IO, PostgreSQL, and Prisma.

---

## 📱 Mobile-Friendly Gameplay & HUD Optimization

The game is fully optimized for mobile devices (smartphones, tablets, and touch-screen devices) with no external app installs required:

### 1. Adaptive Overlay Interface
* On devices with touch capability, the game displays a translucent **mobile driving HUD overlay**:
  * **Left Side**: Steering buttons (`← STEER` and `STEER →`).
  * **Right Side**: Action buttons (`GAS` to accelerate, `BRAKE` to slow down/reverse, `DRIFT` to trigger skid dynamics, and `NITRO` for speed boosts).
* Buttons scale down on small screens and feature responsive touch-down feedback (shrink scale effect and highlight coloring).

### 2. Intelligent HUD Repositioning
* On screens under **768px wide**, the speed and nitro fuel HUD (traditionally in the bottom-right corner) **automatically moves to the top-right corner** (directly underneath the timers).
* This prevents HUD stats from overlapping with touch buttons, leaving the bottom touch zones clean and accessible for fingers.

### 3. Gesture Interferences Prevention
* Disables standard page scrolling and pinch-to-zoom interferences inside the web browser via explicit `touch-action: none` rules on the canvas and body containers, ensuring rapid tapping doesn't cause page jumps.

---

## 🚀 Core Features

* **3D Driving Physics**: Full car and bike controls, steer drifts, and nitrous acceleration.
* **Procedural Environments**: Skydome gradients, low-poly mountain ranges, and path check-points.
* **Audio Synthesizer**: Engines, skids, and crashes generated directly in the browser via the **Web Audio API** (no bulky audio assets).
* **Sync Multiplayer**: 30Hz Socket broadcast loops, dead-reckoning movement projections, client collisions bounces, and synced standings.
* **Database Persistence**: Driver profiles (coins/XP), fastest times, and match history persist on PostgreSQL using **Prisma ORM**.
* **Admin Dashboard**: System telemetry grids (CPU/RAM/Uptime) and PostgreSQL match history logs.
* **CI/CD Pipelines**: Automatic GitHub Actions workflow to build the monorepo and verify Docker configurations on commit pushes.

---

## 📁 Repository Structure

```text
├── packages
│   ├── shared      # Shared types and career stage configurations
│   ├── backend     # Express + Socket.IO server (Prisma SQL persistence)
│   └── frontend    # Three.js racing engine + HTML hud views
├── Dockerfile      # Production multi-stage Docker configuration
├── tsconfig.json   # Root TypeScript configuration
└── package.json    # Monorepo workspaces setup
```

---

## 🛠️ Local Getting Started

### 1. Installation
Install workspace dependencies:
```bash
npm install
```

### 2. Generate Prisma Client
Set up database client definitions:
```bash
npm run db:generate --workspace=@racing-game/backend
```

### 3. Run Dev Mode
Start both backend and Vite dev servers concurrently:
```bash
# Run backend on http://localhost:3001
npm run dev:backend

# Run frontend on http://localhost:3000
npm run dev:frontend
```

---

## 🐳 Docker Deployment

Compile and host both backend services and frontend static assets under a unified server container:

```bash
# Build the production image
docker build -t racing-game:latest .

# Run the container
docker run -p 3001:3001 -e DATABASE_URL="postgresql://..." -e NODE_ENV="production" racing-game:latest
```
