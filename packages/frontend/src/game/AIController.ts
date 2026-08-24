import * as THREE from "three";
import { Vehicle } from "./Vehicle";
import { Track } from "./Track";

export type AIDifficulty = "easy" | "normal" | "hard" | "expert";

export class AIController {
  public vehicle: Vehicle;
  private track: Track;
  public difficulty: AIDifficulty;

  // AI State variables
  private stuckTime: number = 0;
  private isReversing: boolean = false;
  private reverseTimer: number = 0;
  
  // Custom racing line offset (visual variance so they don't drive in a perfect single file line)
  private lateralOffset: number = 0;
  private offsetTimer: number = 0;

  constructor(vehicle: Vehicle, track: Track, difficulty: AIDifficulty) {
    this.vehicle = vehicle;
    this.track = track;
    this.difficulty = difficulty;
    
    // Choose a random racing line offset
    this.selectRandomOffset();
  }

  private selectRandomOffset(): void {
    // Sway slightly left or right of center road line (max road width is 10)
    this.lateralOffset = (Math.random() - 0.5) * 4.5;
    this.offsetTimer = 3 + Math.random() * 5; // pick a new offset in 3-8s
  }

  public update(dt: number): void {
    const vehicle = this.vehicle;
    
    // 1. Decrypt difficulty profile
    let maxSpeedFactor = 0.88;
    let lookAheadBase = 0.022;
    let reactSpeed = 0.85;
    let nitroAllowed = true;
    let driftAllowed = false;

    switch (this.difficulty) {
      case "easy":
        maxSpeedFactor = 0.72;
        lookAheadBase = 0.016;
        reactSpeed = 0.5;
        nitroAllowed = false;
        break;
      case "normal":
        maxSpeedFactor = 0.88;
        lookAheadBase = 0.022;
        reactSpeed = 0.8;
        break;
      case "hard":
        maxSpeedFactor = 0.98;
        lookAheadBase = 0.026;
        reactSpeed = 1.0;
        driftAllowed = true;
        break;
      case "expert":
        maxSpeedFactor = 1.03;
        lookAheadBase = 0.029;
        reactSpeed = 1.0;
        driftAllowed = true;
        break;
    }

    // 2. Manage visual offsets
    this.offsetTimer -= dt;
    if (this.offsetTimer <= 0) {
      this.selectRandomOffset();
    }

    // 3. Find progress along track
    const currentT = this.findClosestTrackT(vehicle.position);
    
    // 4. Calculate look-ahead target
    const speedRatio = Math.abs(vehicle.speed) / vehicle.config.stats.topSpeed;
    const lookAhead = lookAheadBase + speedRatio * 0.015; // look further ahead when fast
    const targetT = (currentT + lookAhead) % 1.0;
    
    const targetCenter = this.track.curve.getPointAt(targetT);
    const tangent = this.track.curve.getTangentAt(targetT);
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

    // Add lateralOffset to make AI drive on left/right side of lane
    const targetPoint = targetCenter.clone().add(normal.clone().multiplyScalar(this.lateralOffset));

    // 5. Stuck / Collision Recovery
    if (Math.abs(vehicle.speed) < 1.5 && !this.isReversing) {
      this.stuckTime += dt;
      if (this.stuckTime > 1.8) {
        // Stuck! Start backing up
        this.isReversing = true;
        this.reverseTimer = 1.2;
        this.stuckTime = 0;
      }
    } else if (Math.abs(vehicle.speed) > 2) {
      this.stuckTime = 0;
    }

    // Double stuck safety (stuck for 6 seconds means glitch)
    if (this.stuckTime > 6.0) {
      this.respawnAI(currentT);
      return;
    }

    // Mock inputs state
    const inputs = {
      accelerate: false,
      brake: false,
      steerLeft: false,
      steerRight: false,
      nitro: false,
      drift: false,
    };

    if (this.isReversing) {
      // Reversing state: steer away from heading and apply brake (reverse)
      inputs.brake = true;
      
      // Steer in opposite direction of target
      const toTarget = targetPoint.clone().sub(vehicle.position);
      const angleToTarget = Math.atan2(toTarget.x, toTarget.z);
      let angleDiff = angleToTarget - vehicle.angle;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;

      if (angleDiff > 0) inputs.steerRight = true;
      else inputs.steerLeft = true;

      this.reverseTimer -= dt;
      if (this.reverseTimer <= 0) {
        this.isReversing = false;
        this.stuckTime = 0;
      }
    } else {
      // Normal Driving state
      // Calculate target vectors
      const toTarget = targetPoint.clone().sub(vehicle.position);
      const angleToTarget = Math.atan2(toTarget.x, toTarget.z);
      
      let angleDiff = angleToTarget - vehicle.angle;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;

      // Obstacle avoidance (Expert difficulty only)
      if (this.difficulty === "expert") {
        this.applyObstacleAvoidance(inputs, angleDiff);
      }

      // Steering decisions
      const steerThreshold = 0.05 / reactSpeed;
      if (angleDiff > steerThreshold) {
        inputs.steerLeft = true;
      } else if (angleDiff < -steerThreshold) {
        inputs.steerRight = true;
      }

      // Speed control: Brake if turning sharply, accelerate on straights
      const isSharpTurn = Math.abs(angleDiff) > 0.28;
      const capSpeed = vehicle.config.stats.topSpeed * maxSpeedFactor;

      if (isSharpTurn && vehicle.speed > capSpeed * 0.5) {
        inputs.brake = true; // brake into turn
        if (driftAllowed && vehicle.speed > 16) {
          inputs.drift = true; // slide corners
        }
      } else {
        // Accelerate
        if (vehicle.speed < capSpeed) {
          inputs.accelerate = true;
        }
        
        // Nitro use on straight segments
        if (
          nitroAllowed &&
          !isSharpTurn &&
          vehicle.speed > capSpeed * 0.7 &&
          vehicle.nitroFuel > 40 &&
          Math.random() < 0.05 // occasional nitro burst
        ) {
          inputs.nitro = true;
        }
      }
    }

    // Send calculated inputs to update vehicle physics
    vehicle.update(dt, inputs);
  }

  private applyObstacleAvoidance(inputs: any, _angleDiff: number): void {
    const pos = this.vehicle.position;
    
    // Find closest obstacle directly in front of the vehicle
    this.track.obstacles.forEach((obs) => {
      if (obs.hit) return; // ignore hit obstacles

      const dist = pos.distanceTo(obs.position);
      if (dist < 15) {
        // Check if obstacle is in path of heading
        const toObstacle = obs.position.clone().sub(pos);
        const angleToObstacle = Math.atan2(toObstacle.x, toObstacle.z);
        let obsAngleDiff = angleToObstacle - this.vehicle.angle;
        while (obsAngleDiff < -Math.PI) obsAngleDiff += Math.PI * 2;
        while (obsAngleDiff > Math.PI) obsAngleDiff -= Math.PI * 2;

        if (Math.abs(obsAngleDiff) < 0.15) {
          // Obstacle directly ahead! Steer away
          if (obsAngleDiff > 0) {
            inputs.steerRight = true;
            inputs.steerLeft = false;
          } else {
            inputs.steerLeft = true;
            inputs.steerRight = false;
          }
        }
      }
    });
  }

  private respawnAI(currentT: number): void {
    console.log(`AI vehicle stuck. Respawning at track coordinate t = ${currentT}`);
    const pos = this.track.curve.getPointAt(currentT);
    const tangent = this.track.curve.getTangentAt(currentT);
    
    // Dropping slightly above track
    const respawnPos = pos.clone().add(new THREE.Vector3(0, 0.5, 0));
    this.vehicle.respawn(respawnPos, tangent);
    
    this.stuckTime = 0;
    this.isReversing = false;
  }

  private findClosestTrackT(pos: THREE.Vector3): number {
    let closestT = 0;
    let minDist = Infinity;
    const steps = 100;
    
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const point = this.track.curve.getPointAt(t);
      const dist = pos.distanceTo(point);
      if (dist < minDist) {
        minDist = dist;
        closestT = t;
      }
    }
    
    return closestT;
  }
}
