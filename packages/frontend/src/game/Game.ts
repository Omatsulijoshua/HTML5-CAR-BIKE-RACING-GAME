import * as THREE from "three";
import { Input } from "./Input";
import { Track } from "./Track";
import { Vehicle } from "./Vehicle";
import { Car } from "./Car";
import { Bike } from "./Bike";
import { DEFAULT_VEHICLES } from "@racing-game/shared";

export class Game {
  private container: HTMLElement;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private clock!: THREE.Clock;
  private isRunning: boolean = false;

  public input!: Input;
  public track!: Track;

  // Active Vehicle and vehicles mapping
  public activeVehicle!: Vehicle;
  private carInstance!: Car;
  private bikeInstance!: Bike;

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

    // 7. Swap Vehicle Keyboard Listeners
    window.addEventListener("keydown", this.onKeyDown.bind(this));
  }

  private initSceneObjects(): void {
    // 1. Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.35);
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

    // 2. Ground scenery
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

    // 3. Track
    this.track = new Track(this.scene);

    // 4. Instantiate Car and Bike vehicles
    this.carInstance = new Car(DEFAULT_VEHICLES.starter_car, this.track);
    this.bikeInstance = new Bike(DEFAULT_VEHICLES.starter_bike, this.track);

    // Default to Car
    this.activeVehicle = this.carInstance;
    this.scene.add(this.activeVehicle.mesh);
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.code === "KeyC") {
      this.switchVehicle(this.carInstance);
    } else if (e.code === "KeyB") {
      this.switchVehicle(this.bikeInstance);
    }
  }

  private switchVehicle(targetVehicle: Vehicle): void {
    if (this.activeVehicle === targetVehicle) return;

    console.log(`Swapping to: ${targetVehicle.config.name}`);

    // Transfer physical momentum and kinematics seamlessly
    targetVehicle.position.copy(this.activeVehicle.position);
    targetVehicle.angle = this.activeVehicle.angle;
    targetVehicle.speed = this.activeVehicle.speed;
    targetVehicle.velocity.copy(this.activeVehicle.velocity);

    // Remove active and add new mesh to the scene
    this.scene.remove(this.activeVehicle.mesh);
    this.activeVehicle = targetVehicle;
    this.scene.add(this.activeVehicle.mesh);

    // Update mesh position immediately
    this.activeVehicle.mesh.position.copy(targetVehicle.position);
    this.activeVehicle.mesh.rotation.y = targetVehicle.angle;
  }

  private start(): void {
    this.isRunning = true;
    this.clock.getDelta();
    this.animate();
  }

  public stop(): void {
    this.isRunning = false;
  }

  private animate = (): void => {
    if (!this.isRunning) return;
    requestAnimationFrame(this.animate);

    const deltaTime = Math.min(this.clock.getDelta(), 0.1);

    this.updatePhysics(deltaTime);
    this.updateCamera(deltaTime);

    this.renderer.render(this.scene, this.camera);
  };

  private updatePhysics(dt: number): void {
    // Collect active input states
    const keys = this.input.keys;
    
    // Map Input states to update vehicle
    this.activeVehicle.update(dt, {
      accelerate: keys.accelerate,
      brake: keys.brake,
      steerLeft: keys.steerLeft,
      steerRight: keys.steerRight,
      nitro: keys.nitro,
      drift: keys.drift,
    });
  }

  private updateCamera(dt: number): void {
    const speedRatio = Math.abs(this.activeVehicle.speed) / this.activeVehicle.config.stats.topSpeed;

    // Speed-based dynamic Field of View (FOV)
    const baseFOV = 70;
    const targetFOV = baseFOV + speedRatio * 15;
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFOV, 8 * dt);
    this.camera.updateProjectionMatrix();

    // Smooth chase camera positioning
    const targetOffset = new THREE.Vector3(
      -Math.sin(this.activeVehicle.angle) * 8.5,
      4.0,
      -Math.cos(this.activeVehicle.angle) * 8.5
    );

    const desiredCamPos = this.activeVehicle.position.clone().add(targetOffset);
    this.camera.position.lerp(desiredCamPos, 8 * dt);

    // Camera points ahead of vehicle direction
    const lookTarget = this.activeVehicle.position.clone().add(
      new THREE.Vector3(
        Math.sin(this.activeVehicle.angle) * 4,
        0.8,
        Math.cos(this.activeVehicle.angle) * 4
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
    window.removeEventListener("keydown", this.onKeyDown.bind(this));
    this.track.destroy(this.scene);
    this.carInstance.destroy(this.scene);
    this.bikeInstance.destroy(this.scene);
    this.renderer.dispose();
    this.container.removeChild(this.renderer.domElement);
  }
}
