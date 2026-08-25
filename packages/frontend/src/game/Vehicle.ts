import * as THREE from "three";
import { VehicleConfig } from "@racing-game/shared";
import { Track } from "./Track";
import { SaveSystem } from "./SaveSystem";

export abstract class Vehicle {
  public mesh: THREE.Group;
  public config: VehicleConfig;
  public driverName: string = "Player";
  public isFinished: boolean = false;
  public finishTime: number = 0;

  // Network sync states
  public isNetworkControlled: boolean = false;
  public networkTargetPosition: THREE.Vector3 = new THREE.Vector3();
  public networkTargetAngle: number = 0;
  
  // Kinematic state
  public position: THREE.Vector3 = new THREE.Vector3();
  public velocity: THREE.Vector3 = new THREE.Vector3();
  public speed: number = 0;
  public angle: number = 0;
  public hasCollidedThisFrame: boolean = false;

  // Lap & Checkpoint states
  public currentLap: number = 1;
  public lastCheckpointIndex: number = -1;

  // Boost Pad state
  public padBoostTime: number = 0;

  // Drift and Nitro state
  public isDrifting: boolean = false;
  public nitroFuel: number = 100;
  public isNitroActive: boolean = false;
  
  // Scenery reference for boundary checks
  protected track: Track;

  constructor(config: VehicleConfig, track: Track) {
    this.config = config;
    this.track = track;
    this.mesh = new THREE.Group();
    
    // Set starting position at track start
    const startPoint = this.track.curve.getPointAt(0);
    const tangent = this.track.curve.getTangentAt(0);
    this.position.copy(startPoint);
    this.mesh.position.copy(this.position);
    this.angle = Math.atan2(tangent.x, tangent.z);
    this.mesh.rotation.y = this.angle;
  }

  public abstract buildModel(): void;

  public update(
    dt: number,
    inputs: {
      accelerate: boolean;
      brake: boolean;
      steerLeft: boolean;
      steerRight: boolean;
      nitro: boolean;
      drift: boolean;
    }
  ): void {
    if (this.isNetworkControlled) {
      // Dead Reckoning: Extrapolate target position forward using heading and speed
      const heading = new THREE.Vector3(Math.sin(this.networkTargetAngle), 0, Math.cos(this.networkTargetAngle)).normalize();
      const projectedPos = this.networkTargetPosition.clone().addScaledVector(heading, this.speed * dt);

      this.position.lerp(projectedPos, 12 * dt);
      
      let diff = this.networkTargetAngle - this.angle;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      this.angle += diff * 12 * dt;

      this.mesh.position.copy(this.position);
      this.mesh.rotation.y = this.angle;
      
      this.updateVisualRotation(dt, 0);
      return;
    }

    const stats = this.config.stats;
    
    // 1. Handle Nitro
    this.isNitroActive = inputs.nitro && this.nitroFuel > 0 && this.speed > 5;
    if (this.isNitroActive) {
      this.nitroFuel = Math.max(0, this.nitroFuel - 25 * dt);
    } else {
      this.nitroFuel = Math.min(100, this.nitroFuel + 5 * dt); // slow recharge
    }

    // 2. Drive stats
    let maxSpeed = this.isNitroActive ? stats.topSpeed * 1.4 : stats.topSpeed;
    let accel = this.isNitroActive ? stats.acceleration * 1.8 : stats.acceleration;

    if (this.padBoostTime > 0) {
      this.padBoostTime = Math.max(0, this.padBoostTime - dt);
      maxSpeed = stats.topSpeed * 1.7;
      accel = stats.acceleration * 3.5;
      this.speed = Math.max(this.speed, stats.topSpeed * 1.25);
    }

    const brakePower = stats.braking;
    const friction = 3.0;

    // 3. Accelerate / Brake / Friction
    if (inputs.accelerate) {
      this.speed += accel * dt;
    } else if (inputs.brake) {
      this.speed -= brakePower * dt;
    } else {
      // Passive deceleration
      if (this.speed > 0) {
        this.speed = Math.max(0, this.speed - friction * dt);
      } else if (this.speed < 0) {
        this.speed = Math.min(0, this.speed + friction * dt);
      }
    }

    // Clamp speed
    this.speed = THREE.MathUtils.clamp(this.speed, -12, maxSpeed);

    // 4. Steering
    let steerInput = 0;
    if (inputs.steerLeft) steerInput -= 1;
    if (inputs.steerRight) steerInput += 1;

    // Drifting logic
    this.isDrifting = inputs.drift && Math.abs(steerInput) > 0 && this.speed > 15;

    let steerPower = stats.handling;
    if (this.driverName.includes("PLAYER")) {
      const profile = SaveSystem.loadProfile();
      steerPower *= (profile.steeringSensitivity !== undefined ? profile.steeringSensitivity : 1.0);
    }

    if (this.isDrifting) {
      steerPower *= 1.5; // sharper turning during drifts
    }

    if (Math.abs(this.speed) > 1) {
      const dirFactor = this.speed > 0 ? 1 : -1;
      this.angle -= steerInput * steerPower * dirFactor * dt;
    }

    // 5. Integrate heading & move
    // If drifting, slide the vehicle outward slightly
    const headingAngle = this.angle;
    let moveAngle = headingAngle;
    if (this.isDrifting) {
      // Slip angle offset
      const slipDirection = -steerInput;
      moveAngle += slipDirection * 0.25; // 15 degrees slip
    }

    const heading = new THREE.Vector3(
      Math.sin(moveAngle),
      0,
      Math.cos(moveAngle)
    ).normalize();

    this.velocity.copy(heading).multiplyScalar(this.speed);
    this.position.addScaledVector(this.velocity, dt);

    // 6. Handle Track Elevation Snap (gravity)
    const closestT = this.findClosestTrackT(this.position);
    const trackPoint = this.track.curve.getPointAt(closestT);
    this.position.y = trackPoint.y;

    // 7. Handle Boundaries / Curbs Collision
    this.checkTrackBoundaries(trackPoint);

    // 8. Update Visual mesh position and heading
    this.mesh.position.copy(this.position);
    
    // Smoothly lean or rotate visual meshes
    this.updateVisualRotation(dt, steerInput);
  }

  protected updateVisualRotation(_dt: number, _steerInput: number): void {
    // Default chassis rotation
    this.mesh.rotation.y = this.angle;
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

  private checkTrackBoundaries(trackPoint: THREE.Vector3): void {
    const roadWidth = 10;
    const vehicleRadius = 1.0;
    const maxAllowedDist = roadWidth / 2 - vehicleRadius;

    // Project distance from track center line
    const distToCenter = new THREE.Vector3(
      this.position.x - trackPoint.x,
      0,
      this.position.z - trackPoint.z
    );

    const distance = distToCenter.length();

    if (distance > maxAllowedDist) {
      // Collide! Push back on track
      distToCenter.normalize().multiplyScalar(maxAllowedDist);
      this.position.x = trackPoint.x + distToCenter.x;
      this.position.z = trackPoint.z + distToCenter.z;

      // Trigger impact shake if moving fast enough
      if (Math.abs(this.speed) > 5) {
        this.hasCollidedThisFrame = true;
      }

      // Slow down drastically and bounce back slightly
      if (this.speed > 5) {
        this.speed = -this.speed * 0.15; // small bounce back
      } else {
        this.speed = 0;
      }
    }
  }

  public respawn(respawnPos: THREE.Vector3, tangent: THREE.Vector3): void {
    this.position.copy(respawnPos);
    this.angle = Math.atan2(tangent.x, tangent.z);
    this.speed = 0;
    this.velocity.set(0, 0, 0);
    this.isDrifting = false;
    this.padBoostTime = 0;
    
    this.mesh.position.copy(this.position);
    this.mesh.rotation.set(0, this.angle, 0);
  }

  public destroy(scene: THREE.Scene): void {
    scene.remove(this.mesh);
    // Recursively dispose geometries and materials
    this.mesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    });
  }
}
