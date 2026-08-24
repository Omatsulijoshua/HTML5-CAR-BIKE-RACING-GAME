import * as THREE from "three";
import { Vehicle } from "./Vehicle";
import { VehicleConfig } from "@racing-game/shared";
import { Track } from "./Track";

export class Car extends Vehicle {
  private wheels: THREE.Mesh[] = [];

  constructor(config: VehicleConfig, track: Track) {
    super(config, track);
    this.buildModel();
  }

  public buildModel(): void {
    // Main Body
    const chassisGeo = new THREE.BoxGeometry(1.8, 0.5, 4.0);
    const chassisMat = new THREE.MeshStandardMaterial({
      color: 0xff3b30, // Red sports car
      roughness: 0.2,
      metalness: 0.8,
    });
    const chassisMesh = new THREE.Mesh(chassisGeo, chassisMat);
    chassisMesh.position.y = 0.4;
    chassisMesh.castShadow = true;
    chassisMesh.receiveShadow = true;
    this.mesh.add(chassisMesh);

    // Windshield & Cabin
    const cabinGeo = new THREE.BoxGeometry(1.3, 0.45, 1.8);
    const cabinMat = new THREE.MeshStandardMaterial({
      color: 0x111115,
      roughness: 0.1,
      metalness: 0.9,
    });
    const cabinMesh = new THREE.Mesh(cabinGeo, cabinMat);
    cabinMesh.position.set(0, 0.8, -0.2);
    cabinMesh.castShadow = true;
    this.mesh.add(cabinMesh);

    // Front Headlights
    const lightGeo = new THREE.BoxGeometry(0.3, 0.15, 0.1);
    const lightMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 1.5,
    });

    const leftLight = new THREE.Mesh(lightGeo, lightMat);
    leftLight.position.set(-0.6, 0.4, 2.0);
    this.mesh.add(leftLight);

    const rightLight = leftLight.clone();
    rightLight.position.set(0.6, 0.4, 2.0);
    this.mesh.add(rightLight);

    // Rear Taillights
    const tailLightMat = new THREE.MeshStandardMaterial({
      color: 0xff0000,
      emissive: 0xff0000,
      emissiveIntensity: 1.2,
    });
    const leftTail = new THREE.Mesh(lightGeo, tailLightMat);
    leftTail.position.set(-0.6, 0.4, -2.0);
    this.mesh.add(leftTail);

    const rightTail = leftTail.clone();
    rightTail.position.set(0.6, 0.4, -2.0);
    this.mesh.add(rightTail);

    // Four Wheels
    const wheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.35, 16);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheelMat = new THREE.MeshStandardMaterial({
      color: 0x111111,
      roughness: 0.8,
    });

    const wheelOffsets = [
      new THREE.Vector3(-1.0, 0.4, 1.2),  // Front Left
      new THREE.Vector3(1.0, 0.4, 1.2),   // Front Right
      new THREE.Vector3(-1.0, 0.4, -1.2), // Rear Left
      new THREE.Vector3(1.0, 0.4, -1.2),  // Rear Right
    ];

    wheelOffsets.forEach((offset) => {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.position.copy(offset);
      wheel.castShadow = true;
      this.mesh.add(wheel);
      this.wheels.push(wheel);
    });
  }

  protected updateVisualRotation(dt: number, steerInput: number): void {
    super.updateVisualRotation(dt, steerInput);
    
    // Rotate wheels visually based on driving speed
    const rotationSpeed = this.speed * 2 * dt;
    this.wheels.forEach((wheel) => {
      wheel.rotateX(rotationSpeed);
    });

    // Make front wheels steer visually left/right
    const frontSteerAngle = -steerInput * 0.4;
    this.wheels[0].rotation.y = frontSteerAngle;
    this.wheels[1].rotation.y = frontSteerAngle;

    // Apply slight roll/tilt during steering or drift to make driving feel dynamic
    const targetRoll = -steerInput * (this.isDrifting ? 0.08 : 0.04) * Math.min(1.0, Math.abs(this.speed) / 10);
    const activeChassis = this.mesh.children[0];
    if (activeChassis) {
      activeChassis.rotation.z = THREE.MathUtils.lerp(activeChassis.rotation.z, targetRoll, 10 * dt);
    }
  }
}
