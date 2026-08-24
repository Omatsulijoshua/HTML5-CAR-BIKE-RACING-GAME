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

  // Camera shake state
  private shakeIntensity: number = 0;
  private shakeOffset: THREE.Vector3 = new THREE.Vector3();

  // Race Manager states
  private raceStarted: boolean = false;
  private raceFinished: boolean = false;
  private raceTime: number = 0;
  private totalLaps: number = 3;
  private bannerTimer: number = 0;

  // HUD Elements
  private hudElement!: HTMLElement;
  private lapElement!: HTMLElement;
  private timerElement!: HTMLElement;
  private speedElement!: HTMLElement;
  private nitroBarElement!: HTMLElement;
  private bannerElement!: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
    this.initThree();
    this.initSceneObjects();
    this.initHUD();
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

    // 7. Swap Vehicle & Respawn Keyboard Listeners
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

  private initHUD(): void {
    this.hudElement = document.getElementById("hud")!;
    this.lapElement = document.getElementById("hud-lap")!;
    this.timerElement = document.getElementById("hud-timer")!;
    this.speedElement = document.getElementById("hud-speed")!;
    this.nitroBarElement = document.getElementById("hud-nitro-bar")!;
    this.bannerElement = document.getElementById("hud-banner")!;

    // Reveal the racing HUD
    if (this.hudElement) {
      this.hudElement.style.display = "block";
    }

    // Trigger start banner
    this.showBanner("3... 2... 1... GO!", 2.0);
    this.raceStarted = true;
  }

  private showBanner(text: string, duration: number): void {
    if (!this.bannerElement) return;
    this.bannerElement.textContent = text;
    this.bannerElement.style.display = "block";
    this.bannerTimer = duration;
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.code === "KeyC" && !this.raceFinished) {
      this.switchVehicle(this.carInstance);
    } else if (e.code === "KeyB" && !this.raceFinished) {
      this.switchVehicle(this.bikeInstance);
    } else if (e.code === "KeyR" && !this.raceFinished) {
      this.respawnActiveVehicle();
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
    targetVehicle.currentLap = this.activeVehicle.currentLap;
    targetVehicle.lastCheckpointIndex = this.activeVehicle.lastCheckpointIndex;
    targetVehicle.padBoostTime = this.activeVehicle.padBoostTime;
    targetVehicle.nitroFuel = this.activeVehicle.nitroFuel;

    // Remove active and add new mesh to the scene
    this.scene.remove(this.activeVehicle.mesh);
    this.activeVehicle = targetVehicle;
    this.scene.add(this.activeVehicle.mesh);

    // Update mesh position immediately
    this.activeVehicle.mesh.position.copy(targetVehicle.position);
    this.activeVehicle.mesh.rotation.y = targetVehicle.angle;
  }

  private respawnActiveVehicle(): void {
    console.log("Respawning active vehicle...");
    const idx = this.activeVehicle.lastCheckpointIndex;
    
    let respawnPos: THREE.Vector3;
    let tangent: THREE.Vector3;

    if (idx === -1) {
      // Respawn at start point of track
      respawnPos = this.track.curve.getPointAt(0);
      tangent = this.track.curve.getTangentAt(0);
    } else {
      // Respawn at last visited checkpoint
      const tList = [0.2, 0.4, 0.6, 0.8, 0.99];
      const t = tList[idx] || 0;
      respawnPos = this.track.checkpoints[idx];
      tangent = this.track.curve.getTangentAt(t);
    }

    // Offset slightly above track surface to drop down cleanly
    const safePos = respawnPos.clone().add(new THREE.Vector3(0, 0.5, 0));
    this.activeVehicle.respawn(safePos, tangent);
    this.showBanner("RESPAWNED", 1.0);
    this.shakeIntensity = 0.5; // slight jolt on respawn drop
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

    this.updateRaceStats(deltaTime);
    this.updatePhysics(deltaTime);
    this.updateCamera(deltaTime);
    this.updateHUD(deltaTime);

    this.renderer.render(this.scene, this.camera);
  };

  private updateRaceStats(dt: number): void {
    if (this.raceFinished || !this.raceStarted) return;
    this.raceTime += dt;
  }

  private updatePhysics(dt: number): void {
    // 1. Update obstacle physics (make hit cones fly away)
    this.track.updateObstacles(dt);

    // If race is finished, force active vehicle to decelerate to a stop
    if (this.raceFinished) {
      this.activeVehicle.update(dt, {
        accelerate: false,
        brake: true,
        steerLeft: false,
        steerRight: false,
        nitro: false,
        drift: false,
      });
      return;
    }

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

    // 2. Check interactive elements collisions
    this.checkCheckpointsCollisions();
    this.checkLapCompletion();
    this.checkBoostPadsCollisions();
    this.checkObstaclesCollisions();

    // Check collision shake triggers
    if (this.activeVehicle.hasCollidedThisFrame) {
      this.shakeIntensity = Math.min(1.2, this.shakeIntensity + 0.7);
      this.activeVehicle.hasCollidedThisFrame = false; // reset
    }

    // Continuous mild shake during boosts
    if (this.activeVehicle.isNitroActive) {
      this.shakeIntensity = Math.max(this.shakeIntensity, 0.18);
    }
  }

  private checkCheckpointsCollisions(): void {
    // Determine target next checkpoint
    const nextIdx = (this.activeVehicle.lastCheckpointIndex + 1) % 5;
    const checkpointPos = this.track.checkpoints[nextIdx];

    if (!checkpointPos) return;

    // Check distance (within 8.5m of the checkpoint center)
    const dist = this.activeVehicle.position.distanceTo(checkpointPos);
    if (dist < 8.5) {
      this.activeVehicle.lastCheckpointIndex = nextIdx;
      console.log(`Checkpoint ${nextIdx + 1}/5 Visited`);
      
      // Update screen text (unless crossing the finish checkpoint index 4, which is handled in Lap Completion)
      if (nextIdx < 4) {
        this.showBanner(`CHECKPOINT ${nextIdx + 1}/5`, 1.2);
      }
    }
  }

  private checkLapCompletion(): void {
    const startFinishPos = this.track.curve.getPointAt(0);
    const dist = this.activeVehicle.position.distanceTo(startFinishPos);

    // Cross start line within 9m
    if (dist < 9.0) {
      // Must have visited the final checkpoint (index 4, near t = 0.99)
      if (this.activeVehicle.lastCheckpointIndex === 4) {
        this.activeVehicle.lastCheckpointIndex = -1; // reset for next lap
        this.activeVehicle.currentLap++;

        if (this.activeVehicle.currentLap > this.totalLaps) {
          // Finish!
          this.raceFinished = true;
          this.showBanner("FINISH!", 10.0);
          console.log(`Race Finished! Final Time: ${this.raceTime.toFixed(2)}s`);
        } else {
          this.showBanner(`LAP ${this.activeVehicle.currentLap}/${this.totalLaps}`, 1.8);
          console.log(`Started Lap ${this.activeVehicle.currentLap}`);
        }
      }
    }
  }

  private checkBoostPadsCollisions(): void {
    this.track.boostPads.forEach((pad) => {
      const dist = this.activeVehicle.position.distanceTo(pad.position);
      if (dist < 4.5 && this.activeVehicle.padBoostTime <= 0) {
        // Trigger super speed boost!
        this.activeVehicle.padBoostTime = 0.8; // 0.8 seconds boost duration
        this.shakeIntensity = Math.max(this.shakeIntensity, 0.45);
        this.showBanner("BOOST!", 0.8);
        console.log("Boost Pad Triggered!");
      }
    });
  }

  private checkObstaclesCollisions(): void {
    this.track.obstacles.forEach((obs) => {
      if (obs.hit) return; // ignore already hit obstacles

      const dist = this.activeVehicle.position.distanceTo(obs.position);
      if (dist < 1.8) {
        // Collide!
        obs.hit = true;

        // Visual knock-back flight physics (make cone fly in direction of impact)
        const heading = new THREE.Vector3(
          Math.sin(this.activeVehicle.angle),
          0,
          Math.cos(this.activeVehicle.angle)
        ).normalize();

        obs.velocity.copy(heading).multiplyScalar(this.activeVehicle.speed * 0.7 + 8);
        obs.velocity.y = 6.0; // lift upward

        // Slow vehicle down
        this.activeVehicle.speed *= 0.55;
        this.shakeIntensity = Math.min(1.2, this.shakeIntensity + 0.6);
        this.showBanner("CONE HIT!", 0.8);
        console.log("Obstacle Cone Collided!");
      }
    });
  }

  private updateCamera(dt: number): void {
    const speedRatio = Math.abs(this.activeVehicle.speed) / this.activeVehicle.config.stats.topSpeed;

    // Speed-based dynamic Field of View (FOV)
    const baseFOV = 70;
    const targetFOV = baseFOV + speedRatio * 15;
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFOV, 8 * dt);
    this.camera.updateProjectionMatrix();

    // Smooth chase camera positioning (lag/interpolation)
    const targetOffset = new THREE.Vector3(
      -Math.sin(this.activeVehicle.angle) * 8.5,
      4.0,
      -Math.cos(this.activeVehicle.angle) * 8.5
    );

    const desiredCamPos = this.activeVehicle.position.clone().add(targetOffset);
    this.camera.position.lerp(desiredCamPos, 8 * dt);

    // Apply procedural camera shake offset
    this.shakeIntensity = Math.max(0, this.shakeIntensity - 3.5 * dt);
    if (this.shakeIntensity > 0) {
      this.shakeOffset.set(
        (Math.random() - 0.5) * this.shakeIntensity * 0.7,
        (Math.random() - 0.5) * this.shakeIntensity * 0.7,
        (Math.random() - 0.5) * this.shakeIntensity * 0.7
      );
      this.camera.position.add(this.shakeOffset);
    }

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

  private updateHUD(dt: number): void {
    // Speedometer: scale driving speed (e.g. m/s * 3.6 for km/h visual equivalent)
    const kmh = Math.round(Math.abs(this.activeVehicle.speed) * 3.6);
    if (this.speedElement) {
      this.speedElement.textContent = kmh.toString();
    }

    // Timer: display decimal seconds
    if (this.timerElement) {
      this.timerElement.textContent = `TIME: ${this.raceTime.toFixed(1)}s`;
    }

    // Lap count
    if (this.lapElement) {
      const displayLap = Math.min(this.activeVehicle.currentLap, this.totalLaps);
      this.lapElement.textContent = `LAP ${displayLap}/${this.totalLaps}`;
    }

    // Nitro fuel progress bar width
    if (this.nitroBarElement) {
      this.nitroBarElement.style.width = `${this.activeVehicle.nitroFuel}%`;
    }

    // Banner notification visibility timer
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0 && this.bannerElement && !this.raceFinished) {
        this.bannerElement.style.display = "none";
      }
    }
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
