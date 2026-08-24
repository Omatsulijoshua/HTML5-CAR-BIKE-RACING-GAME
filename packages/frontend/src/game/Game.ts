import * as THREE from "three";
import { Input } from "./Input";
import { Track } from "./Track";

export class Game {
  private container: HTMLElement;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private clock!: THREE.Clock;
  private isRunning: boolean = false;

  public input!: Input;
  public track!: Track;
  private placeholderVehicle!: THREE.Group;
  
  // Driving stats for placeholder movement
  private vehicleSpeed: number = 0;
  private vehicleAngle: number = 0;
  private vehiclePosition: THREE.Vector3 = new THREE.Vector3(0, 0, 0);

  constructor(container: HTMLElement) {
    this.container = container;
    this.initThree();
    this.initSceneObjects();
    this.start();
  }

  private initThree(): void {
    // 1. Scene setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0c10);
    this.scene.fog = new THREE.FogExp2(0x0a0c10, 0.015);

    // 2. Camera setup
    this.camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, 6, 12);

    // 3. Renderer setup
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.container.appendChild(this.renderer.domElement);

    // 4. Clock setup
    this.clock = new THREE.Clock();

    // 5. Input manager
    this.input = new Input();

    // 6. Handle Window Resize
    window.addEventListener("resize", this.onWindowResize.bind(this));
  }

  private initSceneObjects(): void {
    // 1. Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(40, 60, 20);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 200;
    const d = 50;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    dirLight.shadow.bias = -0.0005;
    this.scene.add(dirLight);

    // 2. Floor grid scenery (green ground)
    const groundGeo = new THREE.PlaneGeometry(1000, 1000);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x142016,
      roughness: 0.9,
      metalness: 0.05,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.1;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // 3. Winding Test Track
    this.track = new Track(this.scene);

    // 4. Placeholder Vehicle mesh (Red Arcade car style box + cylinders)
    this.placeholderVehicle = new THREE.Group();
    
    // Chassis
    const chassisGeo = new THREE.BoxGeometry(2, 0.6, 4.2);
    const chassisMat = new THREE.MeshStandardMaterial({ color: 0xff3b30, roughness: 0.2, metalness: 0.8 });
    const chassis = new THREE.Mesh(chassisGeo, chassisMat);
    chassis.position.y = 0.5;
    chassis.castShadow = true;
    chassis.receiveShadow = true;
    this.placeholderVehicle.add(chassis);

    // Cabin
    const cabinGeo = new THREE.BoxGeometry(1.4, 0.5, 2);
    const cabinMat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.1 });
    const cabin = new THREE.Mesh(cabinGeo, cabinMat);
    cabin.position.set(0, 1, -0.4);
    cabin.castShadow = true;
    this.placeholderVehicle.add(cabin);

    // Wheels (4 cylinders)
    const wheelGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.4, 16);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.7 });

    const wheelPositions = [
      new THREE.Vector3(-1.1, 0.45, 1.3),  // Front Left
      new THREE.Vector3(1.1, 0.45, 1.3),   // Front Right
      new THREE.Vector3(-1.1, 0.45, -1.3), // Rear Left
      new THREE.Vector3(1.1, 0.45, -1.3),  // Rear Right
    ];

    wheelPositions.forEach((pos) => {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.position.copy(pos);
      wheel.castShadow = true;
      this.placeholderVehicle.add(wheel);
    });

    // Start vehicle at the beginning of the track curve
    const startPoint = this.track.curve.getPointAt(0);
    const tangent = this.track.curve.getTangentAt(0);
    this.vehiclePosition.copy(startPoint);
    this.placeholderVehicle.position.copy(this.vehiclePosition);
    
    // Look in direction of track curve tangent
    const lookTarget = startPoint.clone().add(tangent);
    this.placeholderVehicle.lookAt(lookTarget);

    this.scene.add(this.placeholderVehicle);
  }

  private start(): void {
    this.isRunning = true;
    this.clock.getDelta(); // reset clock delta
    this.animate();
  }

  public stop(): void {
    this.isRunning = false;
  }

  private animate = (): void => {
    if (!this.isRunning) return;
    requestAnimationFrame(this.animate);

    const deltaTime = Math.min(this.clock.getDelta(), 0.1); // clamp delta time to avoid large jumps

    this.updatePhysics(deltaTime);
    this.updateCamera(deltaTime);

    this.renderer.render(this.scene, this.camera);
  };

  private updatePhysics(dt: number): void {
    // Simple mock arcade movement using keyboard input
    const keys = this.input.keys;

    // Acceleration & Braking
    const maxSpeed = keys.nitro ? 60 : 35;
    const accel = keys.nitro ? 20 : 12;
    const friction = 2.5;

    if (keys.accelerate) {
      this.vehicleSpeed += accel * dt;
    } else if (keys.brake) {
      this.vehicleSpeed -= accel * 1.5 * dt;
    } else {
      // Natural deceleration / friction
      if (this.vehicleSpeed > 0) {
        this.vehicleSpeed = Math.max(0, this.vehicleSpeed - friction * dt);
      } else if (this.vehicleSpeed < 0) {
        this.vehicleSpeed = Math.min(0, this.vehicleSpeed + friction * dt);
      }
    }

    // Clamp speed
    this.vehicleSpeed = THREE.MathUtils.clamp(this.vehicleSpeed, -10, maxSpeed);

    // Steering
    const steerDir = this.input.getSteerValue();
    const steerSpeed = keys.drift ? 2.5 : 1.8;
    
    if (Math.abs(this.vehicleSpeed) > 1) {
      const dirFactor = this.vehicleSpeed > 0 ? 1 : -1;
      this.vehicleAngle -= steerDir * steerSpeed * dirFactor * dt;
    }

    // Calculate heading vector
    const heading = new THREE.Vector3(
      Math.sin(this.vehicleAngle),
      0,
      Math.cos(this.vehicleAngle)
    ).normalize();

    // Move vehicle mesh
    this.vehiclePosition.add(heading.multiplyScalar(this.vehicleSpeed * dt));
    
    // Snap to ground Y (simple elevation snapping for bridge section)
    const closestT = this.findClosestTrackT(this.vehiclePosition);
    const trackPoint = this.track.curve.getPointAt(closestT);
    this.vehiclePosition.y = trackPoint.y;

    this.placeholderVehicle.position.copy(this.vehiclePosition);
    this.placeholderVehicle.rotation.y = this.vehicleAngle;
  }

  // Helper to find closest point along track to snap Y position
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

  private updateCamera(dt: number): void {
    // Smooth chase camera behind the vehicle
    const targetOffset = new THREE.Vector3(
      -Math.sin(this.placeholderVehicle.rotation.y) * 9,
      4.5,
      -Math.cos(this.placeholderVehicle.rotation.y) * 9
    );

    const desiredCamPos = this.placeholderVehicle.position.clone().add(targetOffset);

    // Interpolate camera position
    this.camera.position.lerp(desiredCamPos, 8 * dt);

    // Look slightly ahead of the vehicle
    const lookTarget = this.placeholderVehicle.position.clone().add(
      new THREE.Vector3(
        Math.sin(this.placeholderVehicle.rotation.y) * 4,
        1,
        Math.cos(this.placeholderVehicle.rotation.y) * 4
      )
    );
    this.camera.lookAt(lookTarget);
  }

  private onWindowResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  public destroy(): void {
    this.stop();
    window.removeEventListener("resize", this.onWindowResize.bind(this));
    this.track.destroy(this.scene);
    this.renderer.dispose();
    this.container.removeChild(this.renderer.domElement);
  }
}
