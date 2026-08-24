import * as THREE from "three";
import { Input } from "./Input";
import { Track } from "./Track";
import { Vehicle } from "./Vehicle";
import { Car } from "./Car";
import { Bike } from "./Bike";
import { AIController } from "./AIController";
import { SaveSystem } from "./SaveSystem";
import { DEFAULT_VEHICLES, CareerStageConfig } from "@racing-game/shared";

export class Game {
  private container: HTMLElement;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private clock!: THREE.Clock;
  private isRunning: boolean = false;

  public input!: Input;
  public track!: Track;

  // Active Vehicle and vehicles list
  public activeVehicle!: Vehicle;
  private carInstance!: Car;
  private bikeInstance!: Bike;

  // AI Opponents
  private aiControllers: AIController[] = [];
  public allVehicles: Vehicle[] = [];

  // Camera shake state
  private shakeIntensity: number = 0;
  private shakeOffset: THREE.Vector3 = new THREE.Vector3();

  // Race Manager states
  private stageConfig: CareerStageConfig;
  private onCompleteCallback: (results: { standing: number; coins: number; xp: number; levelUp: boolean }) => void;
  private raceStarted: boolean = false;
  private raceFinished: boolean = false;
  private raceTime: number = 0;
  private totalLaps: number = 3;
  private bannerTimer: number = 0;

  // HUD Elements
  private hudElement!: HTMLElement;
  private posElement!: HTMLElement;
  private lapElement!: HTMLElement;
  private timerElement!: HTMLElement;
  private speedElement!: HTMLElement;
  private nitroBarElement!: HTMLElement;
  private bannerElement!: HTMLElement;

  constructor(
    container: HTMLElement,
    stageConfig: CareerStageConfig,
    onCompleteCallback: (results: { standing: number; coins: number; xp: number; levelUp: boolean }) => void
  ) {
    this.container = container;
    this.stageConfig = stageConfig;
    this.onCompleteCallback = onCompleteCallback;
    this.totalLaps = stageConfig.laps;

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

    // 4. Instantiate Car and Bike vehicles (Player)
    this.carInstance = new Car(DEFAULT_VEHICLES.starter_car, this.track);
    this.carInstance.driverName = "PLAYER (YOU)";
    this.bikeInstance = new Bike(DEFAULT_VEHICLES.starter_bike, this.track);
    this.bikeInstance.driverName = "PLAYER (YOU)";

    this.activeVehicle = this.carInstance;
    this.scene.add(this.activeVehicle.mesh);

    // 5. Set Starting Grid positions
    const startT = 0;
    const startPoint = this.track.curve.getPointAt(startT);
    const tangent = this.track.curve.getTangentAt(startT);
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    const headingAngle = Math.atan2(tangent.x, tangent.z);

    this.activeVehicle.position.copy(startPoint);
    this.activeVehicle.mesh.position.copy(startPoint);
    this.activeVehicle.angle = headingAngle;
    this.activeVehicle.mesh.rotation.y = headingAngle;

    this.allVehicles = [this.activeVehicle];

    // 6. Spawn AI Opponents dynamically
    const aiCount = this.stageConfig.aiCount;
    for (let i = 0; i < aiCount; i++) {
      const difficulty = this.stageConfig.aiDifficulties[i] || "normal";
      let aiVehicle: Vehicle;

      if (i % 2 === 0) {
        aiVehicle = new Car(DEFAULT_VEHICLES.starter_car, this.track);
        aiVehicle.driverName = `Volt Viper ${i + 1} (AI)`;
        const chassis = aiVehicle.mesh.children[0] as THREE.Mesh;
        if (chassis && chassis.material instanceof THREE.MeshStandardMaterial) {
          const mat = chassis.material.clone();
          mat.color.setHex(0xffcc00); // Yellow
          chassis.material = mat;
        }
      } else {
        aiVehicle = new Bike(DEFAULT_VEHICLES.starter_bike, this.track);
        aiVehicle.driverName = `Apex Specter ${i + 1} (AI)`;
        const chassis = aiVehicle.mesh.children[0] as THREE.Mesh;
        if (chassis && chassis.material instanceof THREE.MeshStandardMaterial) {
          const mat = chassis.material.clone();
          mat.color.setHex(0x39ff14); // Green
          chassis.material = mat;
        }
      }

      // Grid offsets
      const gridOffset = -(5.0 + i * 5.0);
      const laneOffset = i % 2 === 0 ? 2.2 : -2.2;
      const aiPos = startPoint.clone().add(normal.clone().multiplyScalar(laneOffset)).addScaledVector(tangent, gridOffset);

      aiVehicle.position.copy(aiPos);
      aiVehicle.mesh.position.copy(aiPos);
      aiVehicle.angle = headingAngle;
      aiVehicle.mesh.rotation.y = headingAngle;

      this.scene.add(aiVehicle.mesh);
      this.allVehicles.push(aiVehicle);

      // Create AI controller
      this.aiControllers.push(new AIController(aiVehicle, this.track, difficulty));
    }
  }

  private initHUD(): void {
    this.hudElement = document.getElementById("hud")!;
    this.posElement = document.getElementById("hud-pos")!;
    this.lapElement = document.getElementById("hud-lap")!;
    this.timerElement = document.getElementById("hud-timer")!;
    this.speedElement = document.getElementById("hud-speed")!;
    this.nitroBarElement = document.getElementById("hud-nitro-bar")!;
    this.bannerElement = document.getElementById("hud-banner")!;

    if (this.hudElement) {
      this.hudElement.style.display = "block";
    }

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

    // Transfer momentum
    targetVehicle.position.copy(this.activeVehicle.position);
    targetVehicle.angle = this.activeVehicle.angle;
    targetVehicle.speed = this.activeVehicle.speed;
    targetVehicle.velocity.copy(this.activeVehicle.velocity);
    targetVehicle.currentLap = this.activeVehicle.currentLap;
    targetVehicle.lastCheckpointIndex = this.activeVehicle.lastCheckpointIndex;
    targetVehicle.padBoostTime = this.activeVehicle.padBoostTime;
    targetVehicle.nitroFuel = this.activeVehicle.nitroFuel;

    // Swap model meshes
    this.scene.remove(this.activeVehicle.mesh);
    this.activeVehicle = targetVehicle;
    this.scene.add(this.activeVehicle.mesh);

    // Update standing list index 0
    this.allVehicles[0] = this.activeVehicle;

    // Update position
    this.activeVehicle.mesh.position.copy(targetVehicle.position);
    this.activeVehicle.mesh.rotation.y = targetVehicle.angle;
  }

  private respawnActiveVehicle(): void {
    const idx = this.activeVehicle.lastCheckpointIndex;
    let respawnPos: THREE.Vector3;
    let tangent: THREE.Vector3;

    if (idx === -1) {
      respawnPos = this.track.curve.getPointAt(0);
      tangent = this.track.curve.getTangentAt(0);
    } else {
      const tList = [0.2, 0.4, 0.6, 0.8, 0.99];
      const t = tList[idx] || 0;
      respawnPos = this.track.checkpoints[idx];
      tangent = this.track.curve.getTangentAt(t);
    }

    const safePos = respawnPos.clone().add(new THREE.Vector3(0, 0.5, 0));
    this.activeVehicle.respawn(safePos, tangent);
    this.showBanner("RESPAWNED", 1.0);
    this.shakeIntensity = 0.5;
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
    this.track.updateObstacles(dt);

    // Drive AIs
    this.aiControllers.forEach((ai) => {
      if (ai.vehicle.isFinished) {
        ai.vehicle.update(dt, {
          accelerate: false,
          brake: true,
          steerLeft: false,
          steerRight: false,
          nitro: false,
          drift: false,
        });
      } else {
        ai.update(dt);
      }
    });

    // Drive Player
    if (this.raceFinished) {
      this.activeVehicle.update(dt, {
        accelerate: false,
        brake: true,
        steerLeft: false,
        steerRight: false,
        nitro: false,
        drift: false,
      });
    } else {
      const keys = this.input.keys;
      this.activeVehicle.update(dt, {
        accelerate: keys.accelerate,
        brake: keys.brake,
        steerLeft: keys.steerLeft,
        steerRight: keys.steerRight,
        nitro: keys.nitro,
        drift: keys.drift,
      });
    }

    // Check lap progress for all
    this.allVehicles.forEach((vehicle) => {
      this.checkVehicleProgress(vehicle);
    });

    if (this.activeVehicle.hasCollidedThisFrame) {
      this.shakeIntensity = Math.min(1.2, this.shakeIntensity + 0.7);
      this.activeVehicle.hasCollidedThisFrame = false;
    }

    if (this.activeVehicle.isNitroActive) {
      this.shakeIntensity = Math.max(this.shakeIntensity, 0.18);
    }
  }

  private checkVehicleProgress(vehicle: Vehicle): void {
    if (vehicle.isFinished) return;

    // Checkpoints overlap
    const nextIdx = (vehicle.lastCheckpointIndex + 1) % 5;
    const checkpointPos = this.track.checkpoints[nextIdx];

    if (checkpointPos) {
      const dist = vehicle.position.distanceTo(checkpointPos);
      if (dist < 9.0) {
        vehicle.lastCheckpointIndex = nextIdx;
        
        if (vehicle === this.activeVehicle && nextIdx < 4) {
          this.showBanner(`CHECKPOINT ${nextIdx + 1}/5`, 1.2);
        }
      }
    }

    // Start/Finish Lap check
    const startFinishPos = this.track.curve.getPointAt(0);
    const finishDist = vehicle.position.distanceTo(startFinishPos);

    if (finishDist < 10.0 && vehicle.lastCheckpointIndex === 4) {
      vehicle.lastCheckpointIndex = -1;
      vehicle.currentLap++;

      if (vehicle.currentLap > this.totalLaps) {
        vehicle.isFinished = true;
        
        if (vehicle === this.activeVehicle) {
          this.raceFinished = true;
          this.showBanner("FINISH!", 10.0);

          // Calculate final standing
          const getStandingScore = (veh: Vehicle) => {
            const lapScore = veh.currentLap * 10000;
            const checkpointScore = (veh.lastCheckpointIndex + 1) * 1000;
            const nextCPIdx = (veh.lastCheckpointIndex + 1) % 5;
            const nextCP = this.track.checkpoints[nextCPIdx];
            const dist = nextCP ? veh.position.distanceTo(nextCP) : 0;
            return lapScore + checkpointScore - dist;
          };
          const sorted = [...this.allVehicles].sort((a, b) => getStandingScore(b) - getStandingScore(a));
          const standing = sorted.indexOf(this.activeVehicle) + 1;

          // Process rewards
          const coinsEarned = this.stageConfig.rewards.coins[standing] || 50;
          const xpEarned = this.stageConfig.rewards.xp[standing] || 10;
          
          const results = SaveSystem.addRewards(coinsEarned, xpEarned);

          // If 1st place, mark current stage completed to unlock next stage!
          if (standing === 1) {
            SaveSystem.unlockStage(this.stageConfig.id);
          }

          // Transition back callback
          setTimeout(() => {
            this.onCompleteCallback({
              standing,
              coins: coinsEarned,
              xp: xpEarned,
              levelUp: results.levelUp,
            });
          }, 2500);
        }
      } else if (vehicle === this.activeVehicle) {
        this.showBanner(`LAP ${vehicle.currentLap}/${this.totalLaps}`, 1.8);
      }
    }
  }

  private checkBoostPadsCollisions(): void {
    this.track.boostPads.forEach((pad) => {
      const dist = this.activeVehicle.position.distanceTo(pad.position);
      if (dist < 4.5 && this.activeVehicle.padBoostTime <= 0) {
        this.activeVehicle.padBoostTime = 0.8;
        this.shakeIntensity = Math.max(this.shakeIntensity, 0.45);
        this.showBanner("BOOST!", 0.8);
      }
    });
  }

  private checkObstaclesCollisions(): void {
    this.allVehicles.forEach((vehicle) => {
      this.track.obstacles.forEach((obs) => {
        if (obs.hit) return;

        const dist = vehicle.position.distanceTo(obs.position);
        if (dist < 1.8) {
          obs.hit = true;

          const heading = new THREE.Vector3(
            Math.sin(vehicle.angle),
            0,
            Math.cos(vehicle.angle)
          ).normalize();

          obs.velocity.copy(heading).multiplyScalar(vehicle.speed * 0.7 + 8);
          obs.velocity.y = 6.0;

          vehicle.speed *= 0.55;

          if (vehicle === this.activeVehicle) {
            this.shakeIntensity = Math.min(1.2, this.shakeIntensity + 0.6);
            this.showBanner("CONE HIT!", 0.8);
          }
        }
      });
    });
  }

  private updateCamera(dt: number): void {
    const speedRatio = Math.abs(this.activeVehicle.speed) / this.activeVehicle.config.stats.topSpeed;

    const baseFOV = 70;
    const targetFOV = baseFOV + speedRatio * 15;
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFOV, 8 * dt);
    this.camera.updateProjectionMatrix();

    const targetOffset = new THREE.Vector3(
      -Math.sin(this.activeVehicle.angle) * 8.5,
      4.0,
      -Math.cos(this.activeVehicle.angle) * 8.5
    );

    const desiredCamPos = this.activeVehicle.position.clone().add(targetOffset);
    this.camera.position.lerp(desiredCamPos, 8 * dt);

    this.shakeIntensity = Math.max(0, this.shakeIntensity - 3.5 * dt);
    if (this.shakeIntensity > 0) {
      this.shakeOffset.set(
        (Math.random() - 0.5) * this.shakeIntensity * 0.7,
        (Math.random() - 0.5) * this.shakeIntensity * 0.7,
        (Math.random() - 0.5) * this.shakeIntensity * 0.7
      );
      this.camera.position.add(this.shakeOffset);
    }

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
    // Standings calculation
    const getStandingScore = (veh: Vehicle) => {
      const lapScore = veh.currentLap * 10000;
      const checkpointScore = (veh.lastCheckpointIndex + 1) * 1000;
      const nextIdx = (veh.lastCheckpointIndex + 1) % 5;
      const nextCP = this.track.checkpoints[nextIdx];
      const dist = nextCP ? veh.position.distanceTo(nextCP) : 0;
      return lapScore + checkpointScore - dist;
    };

    const sorted = [...this.allVehicles].sort((a, b) => getStandingScore(b) - getStandingScore(a));
    const playerStanding = sorted.indexOf(this.activeVehicle) + 1;
    const suffix = playerStanding === 1 ? "st" : playerStanding === 2 ? "nd" : "3rd";

    if (this.posElement) {
      this.posElement.textContent = `POS: ${playerStanding}${suffix}/3`;
    }

    // Speedometer
    const kmh = Math.round(Math.abs(this.activeVehicle.speed) * 3.6);
    if (this.speedElement) {
      this.speedElement.textContent = kmh.toString();
    }

    // Timer
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

    // Banner visibility
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0 && this.bannerElement && !this.raceFinished) {
        this.bannerElement.style.display = "none";
      }
    }

    this.checkBoostPadsCollisions();
    this.checkObstaclesCollisions();
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
    this.aiControllers.forEach((ai) => ai.vehicle.destroy(this.scene));
    this.renderer.dispose();
    this.container.removeChild(this.renderer.domElement);
  }
}
