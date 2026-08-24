export enum SocketEvent {
  // Client events
  CREATE_ROOM = "client:create_room",
  JOIN_ROOM = "client:join_room",
  READY = "client:ready",
  SELECT_VEHICLE = "client:select_vehicle",
  SELECT_TRACK = "client:select_track",
  PLAYER_INPUT = "client:player_input",
  REQUEST_REMATCH = "client:request_rematch",
  LEAVE_ROOM = "client:leave_room",

  // Server events
  ROOM_CREATED = "server:room_created",
  ROOM_JOINED = "server:room_joined",
  PLAYER_JOINED = "server:player_joined",
  PLAYER_READY = "server:player_ready",
  RACE_STARTING = "server:race_starting",
  RACE_STARTED = "server:race_started",
  GAME_STATE = "server:game_state",
  PLAYER_FINISHED = "server:player_finished",
  RACE_FINISHED = "server:race_finished",
  ROOM_CLOSED = "server:room_closed",
  PLAYER_DISCONNECTED = "server:player_disconnected",
  PLAYER_RECONNECTED = "server:player_reconnected",
}

export type VehicleType = "car" | "bike";

export interface VehicleStats {
  topSpeed: number;
  acceleration: number;
  braking: number;
  handling: number;
  grip: number;
  drift: number;
  nitro: number;
  weight: number;
}

export interface VehicleConfig {
  id: string;
  name: string;
  type: VehicleType;
  stats: VehicleStats;
  unlockCost: number;
  upgradeCost: number;
}

export interface PlayerInputPayload {
  accelerate: boolean;
  brake: boolean;
  steer: number; // -1 to 1
  drift: boolean;
  nitro: boolean;
  sequenceNumber: number;
}

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface Quaternion4D {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface VehicleState {
  position: Vector3D;
  rotation: Quaternion4D;
  velocity: Vector3D;
  angularVelocity: Vector3D;
  speed: number;
  driftScore: number;
  nitroFuel: number;
}

export interface PlayerState {
  id: string;
  username: string;
  isReady: boolean;
  vehicleId: string;
  vehicleType: VehicleType;
  vehicleState: VehicleState;
  currentLap: number;
  lastCheckpoint: number;
  racePosition: number;
  finished: boolean;
  finishTime?: number;
}

export interface GameStatePayload {
  roomId: string;
  trackId: string;
  status: "lobby" | "countdown" | "racing" | "finished";
  countdownTime?: number;
  players: Record<string, PlayerState>;
  timestamp: number;
}

export interface RoomCreatedPayload {
  roomId: string;
  hostId: string;
}

export interface RoomJoinedPayload {
  roomId: string;
  players: { id: string; username: string; isReady: boolean }[];
}

export const DEFAULT_VEHICLES: Record<string, VehicleConfig> = {
  starter_car: {
    id: "starter_car",
    name: "Apex Horizon",
    type: "car",
    stats: {
      topSpeed: 38,
      acceleration: 14,
      braking: 18,
      handling: 2.0,
      grip: 0.85,
      drift: 0.8,
      nitro: 1.0,
      weight: 1200,
    },
    unlockCost: 0,
    upgradeCost: 500,
  },
  starter_bike: {
    id: "starter_bike",
    name: "Volt Raptor",
    type: "bike",
    stats: {
      topSpeed: 35,
      acceleration: 18,
      braking: 22,
      handling: 2.5,
      grip: 0.75,
      drift: 0.6,
      nitro: 1.0,
      weight: 350,
    },
    unlockCost: 0,
    upgradeCost: 500,
  },
};

export type AIDifficulty = "easy" | "normal" | "hard" | "expert";

export interface CareerStageConfig {
  id: string;
  name: string;
  laps: number;
  aiCount: number;
  aiDifficulties: AIDifficulty[];
  rewards: {
    coins: Record<number, number>; // standing (1st: 1, 2nd: 2, etc.) -> coins
    xp: Record<number, number>; // standing -> xp
  };
  unlockCondition?: string; // previous stage ID
  unlocksVehicleId?: string; // vehicle unlocked on 1st place
}

export const CAREER_STAGES: CareerStageConfig[] = [
  {
    id: "stage_1",
    name: "Beginner Sprint",
    laps: 2,
    aiCount: 1,
    aiDifficulties: ["easy"],
    rewards: {
      coins: { 1: 300, 2: 150, 3: 50 },
      xp: { 1: 100, 2: 50, 3: 20 },
    },
  },
  {
    id: "stage_2",
    name: "Desert Dunes Dash",
    laps: 2,
    aiCount: 2,
    aiDifficulties: ["easy", "normal"],
    rewards: {
      coins: { 1: 450, 2: 250, 3: 100 },
      xp: { 1: 150, 2: 80, 3: 40 },
    },
    unlockCondition: "stage_1",
  },
  {
    id: "stage_3",
    name: "Forest Rush Trial",
    laps: 3,
    aiCount: 2,
    aiDifficulties: ["normal", "hard"],
    rewards: {
      coins: { 1: 600, 2: 350, 3: 150 },
      xp: { 1: 200, 2: 120, 3: 60 },
    },
    unlockCondition: "stage_2",
  },
  {
    id: "stage_4",
    name: "Grand Finale Championship",
    laps: 3,
    aiCount: 2,
    aiDifficulties: ["hard", "expert"],
    rewards: {
      coins: { 1: 1000, 2: 500, 3: 200 },
      xp: { 1: 350, 2: 200, 3: 100 },
    },
    unlockCondition: "stage_3",
  },
];
