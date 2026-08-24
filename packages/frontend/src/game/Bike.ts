import * as THREE from "three";
import { Vehicle } from "./Vehicle";
import { VehicleConfig } from "@racing-game/shared";
import { Track } from "./Track";

export class Bike extends Vehicle {
  private wheels: THREE.Mesh[] = [];
  private handlebarGroup!: THREE.Group;

  constructor(config: VehicleConfig, track: Track) {
    super(config, track);
    this.buildModel();
  }

  public buildModel(): void {
    // Motorcycle Main Frame (Narrow)
    const frameGeo = new THREE.BoxGeometry(0.5, 0.9, 2.8);
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x007aff, // Volt Blue bike
      roughness: 0.3,
      metalness: 0.7,
    });
    const frameMesh = new THREE.Mesh(frameGeo, frameMat);
    frameMesh.position.y = 0.6;
    frameMesh.castShadow = true;
    frameMesh.receiveShadow = true;
    this.mesh.add(frameMesh);

    // Seat
    const seatGeo = new THREE.BoxGeometry(0.48, 0.15, 0.8);
    const seatMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });
    const seatMesh = new THREE.Mesh(seatGeo, seatMat);
    seatMesh.position.set(0, 0.95, -0.3);
    seatMesh.castShadow = true;
    this.mesh.add(seatMesh);

    // Front Handlebars Group (to steer visually)
    this.handlebarGroup = new THREE.Group();
    this.handlebarGroup.position.set(0, 1.0, 0.8);

    // Fork bars
    const forkGeo = new THREE.CylinderGeometry(0.08, 0.08, 1.2);
    forkGeo.rotateX(Math.PI / 12);
    const forkMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.9 });
    const leftFork = new THREE.Mesh(forkGeo, forkMat);
    leftFork.position.set(-0.2, -0.4, 0);
    this.handlebarGroup.add(leftFork);

    const rightFork = leftFork.clone();
    rightFork.position.x = 0.2;
    this.handlebarGroup.add(rightFork);

    // Handlebar horizontal grips
    const gripGeo = new THREE.CylinderGeometry(0.05, 0.05, 1.2);
    gripGeo.rotateZ(Math.PI / 2);
    const gripMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });
    const grips = new THREE.Mesh(gripGeo, gripMat);
    grips.position.set(0, 0.2, 0);
    this.handlebarGroup.add(grips);

    this.mesh.add(this.handlebarGroup);

    // Two Wheels (Inline: Front and Rear)
    const wheelGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.25, 16);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheelMat = new THREE.MeshStandardMaterial({
      color: 0x111111,
      roughness: 0.8,
    });

    // Front Wheel (attached to handlebar fork for visual steering!)
    const frontWheel = new THREE.Mesh(wheelGeo, wheelMat);
    frontWheel.position.set(0, -0.9, 0.1); // relative to handlebar fork group
    frontWheel.castShadow = true;
    this.handlebarGroup.add(frontWheel);
    this.wheels.push(frontWheel);

    // Rear Wheel (attached directly to main bike body)
    const rearWheel = new THREE.Mesh(wheelGeo, wheelMat);
    rearWheel.position.set(0, 0.45, -1.1);
    rearWheel.castShadow = true;
    this.mesh.add(rearWheel);
    this.wheels.push(rearWheel);

    // Headlight
    const headlightGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.2, 8);
    headlightGeo.rotateX(Math.PI / 2);
    const headlightMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 1.8,
    });
    const headlight = new THREE.Mesh(headlightGeo, headlightMat);
    headlight.position.set(0, 0.05, 0.15); // relative to handlebars fork
    this.handlebarGroup.add(headlight);
  }

  protected updateVisualRotation(dt: number, steerInput: number): void {
    // 1. Base chassis rotation
    this.mesh.rotation.y = this.angle;

    // 2. Wheel rolling animation
    const rollSpeed = this.speed * 2.2 * dt;
    this.wheels.forEach((w) => w.rotateX(rollSpeed));

    // 3. Handlebar steering rotation
    const steerAngle = -steerInput * 0.5;
    this.handlebarGroup.rotation.y = THREE.MathUtils.lerp(
      this.handlebarGroup.rotation.y,
      steerAngle,
      12 * dt
    );

    // 4. Motorcycle Leaning (Lean body around Z-axis when steering)
    // Speed proportional: lean increases at moderate speed, less at zero
    const speedRatio = Math.min(1.0, Math.abs(this.speed) / 10);
    const targetLean = -steerInput * 0.38 * speedRatio;
    
    // Leans the whole mesh by interpolating rotation.z
    this.mesh.rotation.z = THREE.MathUtils.lerp(
      this.mesh.rotation.z,
      targetLean,
      8 * dt
    );
  }
}
