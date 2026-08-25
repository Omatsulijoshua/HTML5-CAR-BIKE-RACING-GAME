import * as THREE from "three";
import { Input } from "./Input";
import { Track } from "./Track";
import { Vehicle } from "./Vehicle";
import { Car } from "./Car";
import { Bike } from "./Bike";
import { AIController } from "./AIController";
import { SaveSystem } from "./SaveSystem";
import { AudioSystem } from "./AudioSystem";
import { ParticleSystem } from "./ParticleSystem";
import { DEFAULT_VEHICLES, CareerStageConfig, SocketEvent } from "@racing-game/shared";
import { Socket } from "socket.io-client";

export interface RaceStandingEntry {
  name: string;
  vehicleName: string;
  finishTime: number;
  isPlayer: boolean;
}

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

  // Multiplayer network states
  private socket?: Socket;
  private roomId?: string;
  private isMultiplayer: boolean = false;
  private remotePlayers: Map<string, Vehicle> = new Map();

  // Audio and VFX Particle Systems
  private audioSystem!: AudioSystem;
  private particleSystem!: ParticleSystem;

  // Camera shake state
  private shakeIntensity: number = 0;
  private shakeOffset: THREE.Vector3 = new THREE.Vector3();

  // Race Manager states
  private stageConfig: CareerStageConfig;
  private onCompleteCallback: (results: {
    standing: number;
    coins: number;
    xp: number;
    levelUp: boolean;
    standingsList: RaceStandingEntry[];
  }) => void;
  public raceStarted: boolean = false;
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
    onCompleteCallback: (results: {
      standing: number;
      coins: number;
      xp: number;
      levelUp: boolean;
      standingsList: RaceStandingEntry[];
    }) => void,
    socket?: Socket,
    roomId?: string,
    playersList?: any[]
  ) {
    this.container = container;
    this.stageConfig = stageConfig;
    this.onCompleteCallback = onCompleteCallback;
    this.totalLaps = stageConfig.laps;

    this.socket = socket;
    this.roomId = roomId;
    this.isMultiplayer = !!(socket && roomId && playersList);

    this.initThree();
    this.initSceneObjects(playersList);
    this.initAudioAndVFX();
    this.initHUD();
    this.start();

    // If multiplayer, start countdown is driven by server events
    if (!this.isMultiplayer) {
      this.runStartCountdown();
    } else {
      this.setupMultiplayerListeners();
    }
  }

  private initThree(): void {
    const profile = SaveSystem.loadProfile();
    const isHighDetail = profile.graphicsQuality !== "low";

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0c10);
    this.scene.fog = new THREE.FogExp2(0x0a0c10, 0.015);

    this.camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );

    this.renderer = new THREE.WebGLRenderer({ antialias: isHighDetail });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = isHighDetail;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.container.appendChild(this.renderer.domElement);

    this.clock = new THREE.Clock();
    this.input = new Input();

    window.addEventListener("resize", this.onWindowResize.bind(this));
    window.addEventListener("keydown", this.onKeyDown.bind(this));
  }

  private initSceneObjects(playersList?: any[]): void {
    // 1. Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.35);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(40, 60, 20);
    dirLight.castShadow = this.renderer.shadowMap.enabled;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
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
    ground.receiveShadow = this.renderer.shadowMap.enabled;
    this.scene.add(ground);

    // 3. Track
    this.track = new Track(this.scene);

    // 4. Grid orientation vectors
    const startT = 0;
    const startPoint = this.track.curve.getPointAt(startT);
    const tangent = this.track.curve.getTangentAt(startT);
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    const headingAngle = Math.atan2(tangent.x, tangent.z);

    if (this.isMultiplayer && playersList && this.socket) {
      // Setup MULTIPLAYER layout
      console.log("Setting up multiplayer starting grid slots...");
      
      const localIndex = playersList.findIndex((p) => p.id === this.socket?.id);
      
      // Local player vehicle instantiation
      this.carInstance = new Car(DEFAULT_VEHICLES.starter_car, this.track);
      this.carInstance.driverName = "PLAYER (YOU)";
      this.bikeInstance = new Bike(DEFAULT_VEHICLES.starter_bike, this.track);
      this.bikeInstance.driverName = "PLAYER (YOU)";

      this.activeVehicle = this.carInstance;
      this.scene.add(this.activeVehicle.mesh);

      // Positioning local player based on room index
      const gridOffset = -(5.0 + localIndex * 5.0);
      const laneOffset = localIndex % 2 === 0 ? 2.2 : -2.2;
      const playerPos = startPoint.clone().add(normal.clone().multiplyScalar(laneOffset)).addScaledVector(tangent, gridOffset);

      this.activeVehicle.position.copy(playerPos);
      this.activeVehicle.mesh.position.copy(playerPos);
      this.activeVehicle.angle = headingAngle;
      this.activeVehicle.mesh.rotation.y = headingAngle;

      this.allVehicles = [this.activeVehicle];

      // Spawn remote human players
      playersList.forEach((player, idx) => {
        if (player.id !== this.socket?.id) {
          console.log(`Spawning remote vehicle for player: ${player.username}`);
          
          // Remote vehicle model matching vehicleId
          const remoteVeh = new Car(DEFAULT_VEHICLES.starter_car, this.track);
          remoteVeh.driverName = `${player.username}`;
          remoteVeh.isNetworkControlled = true;

          // Alternate paint colors for remote players
          const chassis = remoteVeh.mesh.children[0] as THREE.Mesh;
          if (chassis && chassis.material instanceof THREE.MeshStandardMaterial) {
            const mat = chassis.material.clone();
            mat.color.setHex(idx % 2 === 0 ? 0xff00ff : 0x00ffff); // Purple vs Cyan
            chassis.material = mat;
          }

          const remGridOffset = -(5.0 + idx * 5.0);
          const remLaneOffset = idx % 2 === 0 ? 2.2 : -2.2;
          const remPos = startPoint.clone().add(normal.clone().multiplyScalar(remLaneOffset)).addScaledVector(tangent, remGridOffset);

          remoteVeh.position.copy(remPos);
          remoteVeh.mesh.position.copy(remPos);
          remoteVeh.angle = headingAngle;
          remoteVeh.mesh.rotation.y = headingAngle;

          this.scene.add(remoteVeh.mesh);
          this.remotePlayers.set(player.id, remoteVeh);
          this.allVehicles.push(remoteVeh);
        }
      });

    } else {
      // Setup SINGLE-PLAYER layout
      this.carInstance = new Car(DEFAULT_VEHICLES.starter_car, this.track);
      this.carInstance.driverName = "PLAYER (YOU)";
      this.bikeInstance = new Bike(DEFAULT_VEHICLES.starter_bike, this.track);
      this.bikeInstance.driverName = "PLAYER (YOU)";

      this.activeVehicle = this.carInstance;
      this.scene.add(this.activeVehicle.mesh);

      this.activeVehicle.position.copy(startPoint);
      this.activeVehicle.mesh.position.copy(startPoint);
      this.activeVehicle.angle = headingAngle;
      this.activeVehicle.mesh.rotation.y = headingAngle;

      this.allVehicles = [this.activeVehicle];

      // Spawn AI opponents
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

        const gridOffset = -(5.0 + i * 5.0);
        const laneOffset = i % 2 === 0 ? 2.2 : -2.2;
        const aiPos = startPoint.clone().add(normal.clone().multiplyScalar(laneOffset)).addScaledVector(tangent, gridOffset);

        aiVehicle.position.copy(aiPos);
        aiVehicle.mesh.position.copy(aiPos);
        aiVehicle.angle = headingAngle;
        aiVehicle.mesh.rotation.y = headingAngle;

        this.scene.add(aiVehicle.mesh);
        this.allVehicles.push(aiVehicle);

        this.aiControllers.push(new AIController(aiVehicle, this.track, difficulty));
      }
    }
  }

  private initAudioAndVFX(): void {
    this.audioSystem = new AudioSystem();

    const triggerAudioInit = () => {
      this.audioSystem.init();
      this.audioSystem.resume();
      window.removeEventListener("click", triggerAudioInit);
      window.removeEventListener("keydown", triggerAudioInit);
    };

    window.addEventListener("click", triggerAudioInit);
    window.addEventListener("keydown", triggerAudioInit);

    this.particleSystem = new ParticleSystem(this.scene);
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
  }

  private setupMultiplayerListeners(): void {
    if (!this.socket) return;

    // Listen to real-time broadcast states
    this.socket.on(SocketEvent.GAME_STATE, (data: { players: any[] }) => {
      data.players.forEach((player) => {
        if (player.id !== this.socket?.id) {
          const remoteVeh = this.remotePlayers.get(player.id);
          if (remoteVeh) {
            // Update interpolation network targets
            remoteVeh.networkTargetPosition.set(player.x, player.y, player.z);
            remoteVeh.networkTargetAngle = player.angle;
            
            // Set sync inputs
            remoteVeh.speed = player.speed;
            remoteVeh.isNitroActive = player.isNitroActive;
            remoteVeh.isDrifting = player.isDrifting;
          }
        }
      });
    });

    // Listen to unexpected disconnect closures
    this.socket.on(SocketEvent.ROOM_CLOSED, () => {
      this.stop();
      alert("Host left the match. Closing race...");
      this.onCompleteCallback({
        standing: 1,
        coins: 0,
        xp: 0,
        levelUp: false,
        standingsList: [],
      });
    });
  }

  public startRaceNow(): void {
    this.raceStarted = true;
    
    // Spawn "GO!" text overlay
    const el = document.createElement("div");
    el.className = "countdown-number";
    el.textContent = "GO!";
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 980);
  }

  private runStartCountdown(): void {
    this.raceStarted = false;

    const spawnNumber = (txt: string) => {
      const el = document.createElement("div");
      el.className = "countdown-number";
      el.textContent = txt;
      document.body.appendChild(el);
      
      setTimeout(() => {
        el.remove();
      }, 980);
    };

    spawnNumber("3");
    setTimeout(() => spawnNumber("2"), 1000);
    setTimeout(() => spawnNumber("1"), 2000);
    setTimeout(() => {
      this.startRaceNow();
    }, 3000);
  }

  private showBanner(text: string, duration: number): void {
    if (!this.bannerElement) return;
    this.bannerElement.textContent = text;
    this.bannerElement.style.display = "block";
    this.bannerTimer = duration;
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.code === "KeyC" && !this.raceFinished && !this.isMultiplayer) {
      this.switchVehicle(this.carInstance);
    } else if (e.code === "KeyB" && !this.raceFinished && !this.isMultiplayer) {
      this.switchVehicle(this.bikeInstance);
    } else if (e.code === "KeyR" && !this.raceFinished) {
      this.respawnActiveVehicle();
    }
  }

  private switchVehicle(targetVehicle: Vehicle): void {
    if (this.activeVehicle === targetVehicle) return;

    console.log(`Swapping to: ${targetVehicle.config.name}`);

    targetVehicle.position.copy(this.activeVehicle.position);
    targetVehicle.angle = this.activeVehicle.angle;
    targetVehicle.speed = this.activeVehicle.speed;
    targetVehicle.velocity.copy(this.activeVehicle.velocity);
    targetVehicle.currentLap = this.activeVehicle.currentLap;
    targetVehicle.lastCheckpointIndex = this.activeVehicle.lastCheckpointIndex;
    targetVehicle.padBoostTime = this.activeVehicle.padBoostTime;
    targetVehicle.nitroFuel = this.activeVehicle.nitroFuel;

    this.scene.remove(this.activeVehicle.mesh);
    this.activeVehicle = targetVehicle;
    this.scene.add(this.activeVehicle.mesh);

    this.allVehicles[0] = this.activeVehicle;

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
    if (!this.raceStarted) {
      this.activeVehicle.speed = 0;
      this.activeVehicle.update(dt, {
        accelerate: false,
        brake: false,
        steerLeft: false,
        steerRight: false,
        nitro: false,
        drift: false,
      });

      this.allVehicles.forEach((veh) => {
        veh.speed = 0;
        veh.update(dt, {
          accelerate: false,
          brake: false,
          steerLeft: false,
          steerRight: false,
          nitro: false,
          drift: false,
        });
      });
      return;
    }

    this.track.updateObstacles(dt);

    if (this.isMultiplayer) {
      // 1. Emit spatial coordinates to server (30Hz tick rate updates)
      if (this.socket && this.roomId && !this.raceFinished) {
        this.socket.emit(SocketEvent.PLAYER_INPUT, {
          roomId: this.roomId,
          x: this.activeVehicle.position.x,
          y: this.activeVehicle.position.y,
          z: this.activeVehicle.position.z,
          angle: this.activeVehicle.angle,
          speed: this.activeVehicle.speed,
          isNitroActive: this.activeVehicle.isNitroActive,
          isDrifting: this.activeVehicle.isDrifting,
          vehicleId: this.activeVehicle.config.id,
        });
      }

      // 2. Drive remote human meshes using interpolation LERP inside Vehicle update
      this.remotePlayers.forEach((remoteVeh) => {
        remoteVeh.update(dt, {
          accelerate: false,
          brake: false,
          steerLeft: false,
          steerRight: false,
          nitro: remoteVeh.isNitroActive,
          drift: remoteVeh.isDrifting,
        });

        // Spawn VFX Particles for remote opponents!
        if (remoteVeh.isDrifting && Math.abs(remoteVeh.speed) > 12) {
          const heading = new THREE.Vector3(Math.sin(remoteVeh.angle), 0, Math.cos(remoteVeh.angle)).normalize();
          const smokePos = remoteVeh.position.clone().addScaledVector(heading, -1.3);
          smokePos.y += 0.1;
          this.particleSystem.spawnTireSmoke(smokePos, heading.clone().multiplyScalar(-remoteVeh.speed * 0.45));
        }

        if (remoteVeh.isNitroActive) {
          const heading = new THREE.Vector3(Math.sin(remoteVeh.angle), 0, Math.cos(remoteVeh.angle)).normalize();
          const flamePos = remoteVeh.position.clone().addScaledVector(heading, -1.6);
          flamePos.y += 0.25;
          this.particleSystem.spawnNitroFlame(flamePos, heading.clone().multiplyScalar(-remoteVeh.speed * 0.65 - 3));
        }
      });

    } else {
      // Drive AI Opponents
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
    }

    // Drive local human Player
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

    // Audio synthesizer updates
    const speedRatio = Math.abs(this.activeVehicle.speed) / this.activeVehicle.config.stats.topSpeed;
    this.audioSystem.updateEngineSound(speedRatio, this.input.keys.accelerate);
    this.audioSystem.setDriftingSound(this.activeVehicle.isDrifting && this.activeVehicle.speed > 10);
    this.audioSystem.setBoostSound(this.activeVehicle.isNitroActive || this.activeVehicle.padBoostTime > 0);

    if (this.activeVehicle.hasCollidedThisFrame) {
      this.shakeIntensity = Math.min(1.2, this.shakeIntensity + 0.7);
      this.audioSystem.playCollisionSound();
      this.activeVehicle.hasCollidedThisFrame = false;
    }

    // Local player smoke puffs
    if (this.activeVehicle.isDrifting && Math.abs(this.activeVehicle.speed) > 12) {
      const headingDir = new THREE.Vector3(Math.sin(this.activeVehicle.angle), 0, Math.cos(this.activeVehicle.angle)).normalize();
      const smokePos = this.activeVehicle.position.clone().addScaledVector(headingDir, -1.3);
      smokePos.y += 0.1;
      this.particleSystem.spawnTireSmoke(smokePos, headingDir.clone().multiplyScalar(-this.activeVehicle.speed * 0.45));
    }

    // Local player nitro flame sparks
    if (this.activeVehicle.isNitroActive) {
      const headingDir = new THREE.Vector3(Math.sin(this.activeVehicle.angle), 0, Math.cos(this.activeVehicle.angle)).normalize();
      const flamePos = this.activeVehicle.position.clone().addScaledVector(headingDir, -1.6);
      flamePos.y += 0.25;
      this.particleSystem.spawnNitroFlame(flamePos, headingDir.clone().multiplyScalar(-this.activeVehicle.speed * 0.65 - 3));
    }

    this.particleSystem.update(dt);

    if (this.activeVehicle.isNitroActive) {
      this.shakeIntensity = Math.max(this.shakeIntensity, 0.18);
    }
  }

  private checkVehicleProgress(vehicle: Vehicle): void {
    if (vehicle.isFinished) return;

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

    const startFinishPos = this.track.curve.getPointAt(0);
    const finishDist = vehicle.position.distanceTo(startFinishPos);

    if (finishDist < 10.0 && vehicle.lastCheckpointIndex === 4) {
      vehicle.lastCheckpointIndex = -1;
      vehicle.currentLap++;

      if (vehicle.currentLap > this.totalLaps) {
        vehicle.isFinished = true;
        vehicle.finishTime = this.raceTime;
        
        if (vehicle === this.activeVehicle) {
          this.raceFinished = true;
          this.showBanner("FINISH!", 10.0);

          // Force all unfinished racers to log times
          this.allVehicles.forEach((veh) => {
            if (!veh.isFinished) {
              veh.isFinished = true;
              veh.finishTime = this.raceTime + (5.0 - veh.lastCheckpointIndex * 0.8) + Math.random() * 2.0;
            }
          });

          // Build standings list
          const sortedEntries: RaceStandingEntry[] = this.allVehicles
            .map((veh) => ({
              name: veh.driverName,
              vehicleName: veh.config.name,
              finishTime: veh.finishTime,
              isPlayer: (veh === this.activeVehicle),
            }))
            .sort((a, b) => a.finishTime - b.finishTime);

          const standing = sortedEntries.findIndex((e) => e.isPlayer) + 1;

          let coinsEarned = 0;
          let xpEarned = 0;
          let levelUp = false;

          if (!this.isMultiplayer) {
            coinsEarned = this.stageConfig.rewards.coins[standing] || 50;
            xpEarned = this.stageConfig.rewards.xp[standing] || 10;
            const res = SaveSystem.addRewards(coinsEarned, xpEarned);
            levelUp = res.levelUp;

            if (standing === 1) {
              SaveSystem.unlockStage(this.stageConfig.id);
            }
          } else {
            // Multiplayer basic reward payouts
            coinsEarned = standing === 1 ? 150 : standing === 2 ? 80 : 40;
            xpEarned = standing === 1 ? 100 : standing === 2 ? 60 : 30;
            const res = SaveSystem.addRewards(coinsEarned, xpEarned);
            levelUp = res.levelUp;
          }

          setTimeout(() => {
            this.onCompleteCallback({
              standing,
              coins: coinsEarned,
              xp: xpEarned,
              levelUp,
              standingsList: sortedEntries,
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
            this.audioSystem.playCollisionSound();
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
      const totalDrivers = this.allVehicles.length;
      this.posElement.textContent = `POS: ${playerStanding}${suffix}/${totalDrivers}`;
    }

    const kmh = Math.round(Math.abs(this.activeVehicle.speed) * 3.6);
    if (this.speedElement) {
      this.speedElement.textContent = kmh.toString();
    }

    if (this.timerElement) {
      this.timerElement.textContent = `TIME: ${this.raceTime.toFixed(1)}s`;
    }

    if (this.lapElement) {
      const displayLap = Math.min(this.activeVehicle.currentLap, this.totalLaps);
      this.lapElement.textContent = `LAP ${displayLap}/${this.totalLaps}`;
    }

    if (this.nitroBarElement) {
      this.nitroBarElement.style.width = `${this.activeVehicle.nitroFuel}%`;
    }

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
    
    // Clean socket event listeners to avoid memory leaks
    if (this.socket) {
      this.socket.off(SocketEvent.GAME_STATE);
      this.socket.off(SocketEvent.ROOM_CLOSED);
    }

    window.removeEventListener("resize", this.onWindowResize.bind(this));
    window.removeEventListener("keydown", this.onKeyDown.bind(this));
    this.track.destroy(this.scene);
    this.carInstance?.destroy(this.scene);
    this.bikeInstance?.destroy(this.scene);
    this.remotePlayers.forEach((veh) => veh.destroy(this.scene));
    this.aiControllers.forEach((ai) => ai.vehicle.destroy(this.scene));
    this.particleSystem.clear();
    this.renderer.dispose();
    this.container.removeChild(this.renderer.domElement);
  }
}
