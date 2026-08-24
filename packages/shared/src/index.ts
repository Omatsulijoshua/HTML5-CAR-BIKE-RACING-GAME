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
