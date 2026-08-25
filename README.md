# 🏎️ HTML5 3D Car & Bike Racing Game

A high-performance, real-time multiplayer 3D arcade racing game built using Three.js, Express, Socket.IO, PostgreSQL, and Prisma.

---

## 🚀 Key Features

* **Advanced Driving Physics**: High-speed vehicle steering mechanics, drift slides, and dynamic nitro boosts.
* **Procedural skydome & Terrain**: Gradient horizon skydomes and low-poly distance mountain cone decorations.
* **Audio Synthesizer**: Engines, tires, and impacts synthesized in real-time using the **Web Audio API**.
* **Real-time Multiplayer**: 30Hz broadcast loops with dead-reckoning position extrapolation and vehicle-to-vehicle elastic collision responses.
* **Standings & Lap Sync**: Precise progress tracking across checkpoints and synced finish times.
* **Database Persistence**: UserProfile saving/loading (coins/XP), BestTimes records, and MatchHistory logging on PostgreSQL using **Prisma ORM**.
* **Admin Dashboard**: System telemetry grids (CPU/RAM/Uptime) and PostgreSQL match history logs.
* **Mobile Touch Controls**: Translucent on-screen touch overlays with disabled page scroll gestures for mobile screens.
* **CI/CD Build Pipelines**: Automated GitHub Actions workflow compiling workspaces and testing Docker builds on push.

---

## 📁 Repository Structure

```text
├── packages
│   ├── shared      # Shared types and career configs
│   ├── backend     # Express + Socket.IO server (Prisma SQL persistence)
│   └── frontend    # Three.js racing engine + HTML hud views
├── Dockerfile      # Production multi-stage Docker configurations
└── package.json    # Workspaces setup
```

---

## 🛠️ Getting Started

### 1. Installation
Install dependencies from the monorepo root:
```bash
npm install
```

### 2. Generate Prisma Client
Set up your database mappings inside the backend workspace:
```bash
npm run db:generate --workspace=@racing-game/backend
```

### 3. Run Development Servers
Boot the backend server and frontend Vite development server concurrently:
```bash
# Run backend on http://localhost:3001
npm run dev:backend

# Run frontend on http://localhost:3000
npm run dev:frontend
```

---

## 🐳 Docker Production Deployment

Build and run the entire unified server stack (which hosts both frontend assets statically and WebSocket connections on port `3001`):

```bash
# Build the production image
docker build -t racing-game:latest .

# Run the container
docker run -p 3001:3001 --env DATABASE_URL="your-postgresql-url" racing-game:latest
```
