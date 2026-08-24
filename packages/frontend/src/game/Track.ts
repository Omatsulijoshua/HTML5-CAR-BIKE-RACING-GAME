import * as THREE from "three";

export class Track {
  public curve: THREE.CatmullRomCurve3;
  private roadMesh!: THREE.Mesh;
  private startLineMesh!: THREE.Mesh;
  private environmentGroup: THREE.Group;

  // Active racing systems
  public checkpoints: THREE.Vector3[] = [];
  public boostPads: { mesh: THREE.Mesh; position: THREE.Vector3 }[] = [];
  public obstacles: { mesh: THREE.Group; position: THREE.Vector3; initialPos: THREE.Vector3; hit: boolean; velocity: THREE.Vector3 }[] = [];

  constructor(scene: THREE.Scene) {
    this.environmentGroup = new THREE.Group();
    scene.add(this.environmentGroup);

    // 1. Create the track curve (a pleasant, winding layout)
    const points = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(30, 0, 15),
      new THREE.Vector3(60, 2, 0),       // elevation ramp
      new THREE.Vector3(80, 0, -40),
      new THREE.Vector3(40, 0, -80),
      new THREE.Vector3(0, 3, -60),       // bridge/hill section
      new THREE.Vector3(-40, 0, -80),
      new THREE.Vector3(-80, 0, -40),
      new THREE.Vector3(-60, 0, 0),
      new THREE.Vector3(-30, 0, 15),
    ];
    this.curve = new THREE.CatmullRomCurve3(points, true);

    this.createRoad();
    this.createStartFinishLine();
    this.createEnvironment();
    
    // Create new interactive systems
    this.createCheckpoints();
    this.createBoostPads();
    this.createObstacles();
  }

  private createRoad(): void {
    const roadWidth = 10;
    const roadThickness = 0.2;

    const shape = new THREE.Shape();
    shape.moveTo(-roadWidth / 2, -roadThickness / 2);
    shape.lineTo(roadWidth / 2, -roadThickness / 2);
    shape.lineTo(roadWidth / 2, roadThickness / 2);
    shape.lineTo(-roadWidth / 2, roadThickness / 2);
    shape.lineTo(-roadWidth / 2, -roadThickness / 2);

    const extrudeSettings = {
      steps: 150,
      bevelEnabled: false,
      extrudePath: this.curve,
    };

    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    const material = new THREE.MeshStandardMaterial({
      color: 0x1a1a1c,
      roughness: 0.8,
      metalness: 0.1,
    });

    this.roadMesh = new THREE.Mesh(geometry, material);
    this.roadMesh.receiveShadow = true;
    this.roadMesh.castShadow = true;
    this.environmentGroup.add(this.roadMesh);

    // Add white/red boundary stripes
    this.createCurbs(roadWidth);
  }

  private createCurbs(roadWidth: number): void {
    const steps = 200;
    const curbWidth = 0.5;
    const curbHeight = 0.1;

    const leftCurbPoints: THREE.Vector3[] = [];
    const rightCurbPoints: THREE.Vector3[] = [];

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const point = this.curve.getPointAt(t);
      const tangent = this.curve.getTangentAt(t);
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

      leftCurbPoints.push(point.clone().add(normal.clone().multiplyScalar(roadWidth / 2 + curbWidth / 2)));
      rightCurbPoints.push(point.clone().add(normal.clone().multiplyScalar(-(roadWidth / 2 + curbWidth / 2))));
    }

    for (let i = 0; i < steps; i++) {
      const isRed = i % 2 === 0;
      const curbMaterial = new THREE.MeshStandardMaterial({
        color: isRed ? 0xff3b30 : 0xffffff,
        roughness: 0.5,
      });

      const p1Left = leftCurbPoints[i];
      const p2Left = leftCurbPoints[i + 1] || leftCurbPoints[0];
      this.createCurbSegment(p1Left, p2Left, curbHeight, curbWidth, curbMaterial);

      const p1Right = rightCurbPoints[i];
      const p2Right = rightCurbPoints[i + 1] || rightCurbPoints[0];
      this.createCurbSegment(p1Right, p2Right, curbHeight, curbWidth, curbMaterial);
    }
  }

  private createCurbSegment(
    p1: THREE.Vector3,
    p2: THREE.Vector3,
    height: number,
    width: number,
    material: THREE.Material
  ): void {
    const distance = p1.distanceTo(p2);
    const geometry = new THREE.BoxGeometry(width, height, distance);
    const mesh = new THREE.Mesh(geometry, material);

    const midpoint = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
    mesh.position.copy(midpoint);

    mesh.lookAt(p2);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    this.environmentGroup.add(mesh);
  }

  private createStartFinishLine(): void {
    const width = 10;
    const length = 2.5;
    const geometry = new THREE.PlaneGeometry(width, length);

    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    const size = 16;
    for (let y = 0; y < 128; y += size) {
      for (let x = 0; x < 128; x += size) {
        ctx.fillStyle = ((x / size) + (y / size)) % 2 === 0 ? "#ffffff" : "#000000";
        ctx.fillRect(x, y, size, size);
      }
    }
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.8,
      side: THREE.DoubleSide,
    });

    this.startLineMesh = new THREE.Mesh(geometry, material);
    this.startLineMesh.rotation.x = -Math.PI / 2;
    
    const startPoint = this.curve.getPointAt(0);
    const tangent = this.curve.getTangentAt(0);
    this.startLineMesh.position.copy(startPoint.clone().add(new THREE.Vector3(0, 0.11, 0)));
    this.startLineMesh.lookAt(startPoint.clone().add(tangent));
    this.startLineMesh.rotateX(Math.PI / 2);

    this.environmentGroup.add(this.startLineMesh);
  }

  private createCheckpoints(): void {
    // 5 Checkpoints around the track at specific t values
    const tValues = [0.2, 0.4, 0.6, 0.8, 0.99]; // 0.99 is near start/finish line
    
    const archMat = new THREE.MeshStandardMaterial({
      color: 0x00d2ff,
      emissive: 0x0088cc,
      transparent: true,
      opacity: 0.5,
      roughness: 0.1,
    });

    const postGeo = new THREE.CylinderGeometry(0.12, 0.12, 6, 8);
    const beamGeo = new THREE.BoxGeometry(11.5, 0.3, 0.3);

    tValues.forEach((t) => {
      const center = this.curve.getPointAt(t);
      const tangent = this.curve.getTangentAt(t);
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
      
      const checkpointGroup = new THREE.Group();
      checkpointGroup.position.copy(center);

      // Left Post
      const leftPost = new THREE.Mesh(postGeo, archMat);
      leftPost.position.set(normal.x * 5.6, 3, normal.z * 5.6);
      checkpointGroup.add(leftPost);

      // Right Post
      const rightPost = new THREE.Mesh(postGeo, archMat);
      rightPost.position.set(-normal.x * 5.6, 3, -normal.z * 5.6);
      checkpointGroup.add(rightPost);

      // Lintel crossbar
      const crossbar = new THREE.Mesh(beamGeo, archMat);
      crossbar.position.y = 6;
      checkpointGroup.add(crossbar);

      // Look at the curve direction
      checkpointGroup.lookAt(center.clone().add(tangent));

      this.environmentGroup.add(checkpointGroup);
      this.checkpoints.push(center);
    });
  }

  private createBoostPads(): void {
    // 3 Boost pads placed on the track surface
    const tValues = [0.15, 0.48, 0.75];

    // Procedural glowing green chevron texture
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    
    // Background dark green
    ctx.fillStyle = "#0c1f0e";
    ctx.fillRect(0, 0, 128, 64);
    
    // Draw neon green chevrons
    ctx.strokeStyle = "#39ff14";
    ctx.lineWidth = 7;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (let i = 0; i < 3; i++) {
      const xOffset = i * 36 + 26;
      ctx.beginPath();
      ctx.moveTo(xOffset, 12);
      ctx.lineTo(xOffset + 22, 32);
      ctx.lineTo(xOffset, 52);
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    const boostMat = new THREE.MeshStandardMaterial({
      map: texture,
      emissiveMap: texture,
      emissive: 0x39ff14,
      emissiveIntensity: 0.6,
      roughness: 0.5,
      side: THREE.DoubleSide,
    });

    const geometry = new THREE.PlaneGeometry(8, 2.5);

    tValues.forEach((t) => {
      const center = this.curve.getPointAt(t);
      const tangent = this.curve.getTangentAt(t);
      
      const mesh = new THREE.Mesh(geometry, boostMat);
      mesh.position.copy(center.clone().add(new THREE.Vector3(0, 0.12, 0))); // slightly above road Y
      
      // Orient facing along road
      mesh.lookAt(center.clone().add(tangent));
      mesh.rotateX(Math.PI / 2); // lie flat

      this.environmentGroup.add(mesh);
      this.boostPads.push({ mesh, position: center });
    });
  }

  private createObstacles(): void {
    // Cone obstacles placed at t = 0.3, 0.65, 0.85
    const tValues = [0.3, 0.65, 0.85];

    tValues.forEach((t) => {
      const center = this.curve.getPointAt(t);
      const tangent = this.curve.getTangentAt(t);
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

      // Spawn a row of 3 cones at this coordinate
      const offsets = [-2.2, 0, 2.2];
      offsets.forEach((offsetX) => {
        const coneGroup = new THREE.Group();
        
        // Calculate offset position relative to curve direction
        const pos = center.clone().add(normal.clone().multiplyScalar(offsetX));
        pos.y += 0.5; // half cone height

        coneGroup.position.copy(pos);
        coneGroup.lookAt(center.clone().add(tangent));

        // Build low-poly orange cone mesh
        const coneGeo = new THREE.ConeGeometry(0.35, 1.0, 8);
        const coneMat = new THREE.MeshStandardMaterial({ color: 0xff6600, roughness: 0.6 });
        const cone = new THREE.Mesh(coneGeo, coneMat);
        cone.position.y = 0.5;
        cone.castShadow = true;
        coneGroup.add(cone);

        // White reflective band
        const bandGeo = new THREE.CylinderGeometry(0.2, 0.22, 0.2, 8);
        const bandMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
        const band = new THREE.Mesh(bandGeo, bandMat);
        band.position.y = 0.5;
        coneGroup.add(band);

        // Black base plate
        const baseGeo = new THREE.BoxGeometry(0.7, 0.08, 0.7);
        const baseMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
        const base = new THREE.Mesh(baseGeo, baseMat);
        base.position.y = 0.04;
        base.receiveShadow = true;
        coneGroup.add(base);

        this.environmentGroup.add(coneGroup);

        this.obstacles.push({
          mesh: coneGroup,
          position: pos,
          initialPos: pos.clone(),
          hit: false,
          velocity: new THREE.Vector3(0, 0, 0),
        });
      });
    });
  }

  public updateObstacles(dt: number): void {
    // Update physics on hit obstacles (make them fly away dynamically)
    this.obstacles.forEach((obs) => {
      if (obs.hit) {
        // Simple gravity and velocity drift integration
        obs.mesh.position.addScaledVector(obs.velocity, dt);
        obs.velocity.y -= 9.8 * dt; // gravity
        obs.mesh.rotation.x += 5 * dt;
        obs.mesh.rotation.z += 5 * dt;

        // Ground check
        if (obs.mesh.position.y < obs.initialPos.y - 0.25) {
          obs.mesh.position.y = obs.initialPos.y - 0.25;
          obs.velocity.set(0, 0, 0); // stop
        }
      }
    });
  }

  public resetObstacles(): void {
    // Reset all obstacles to initial positions
    this.obstacles.forEach((obs) => {
      obs.hit = false;
      obs.mesh.position.copy(obs.initialPos);
      obs.mesh.rotation.set(0, 0, 0);
      obs.velocity.set(0, 0, 0);
      obs.mesh.lookAt(obs.initialPos.clone().add(this.curve.getTangentAt(0))); // reset look direction (approximate or just zero)
    });
  }

  private createEnvironment(): void {
    const treeGeo = new THREE.ConeGeometry(2, 6, 8);
    const trunkGeo = new THREE.CylinderGeometry(0.4, 0.4, 2);
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.9 });
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5d4037, roughness: 0.9 });

    for (let i = 0; i < 40; i++) {
      const t = i / 40;
      const point = this.curve.getPointAt(t);
      const tangent = this.curve.getTangentAt(t);
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

      const side = i % 2 === 0 ? 1 : -1;
      const distanceOffset = 12 + Math.random() * 8;
      const treePos = point.clone().add(normal.clone().multiplyScalar(side * distanceOffset));
      treePos.y = 0;

      const treeGroup = new THREE.Group();
      treeGroup.position.copy(treePos);

      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.y = 1;
      trunk.castShadow = true;
      treeGroup.add(trunk);

      const leaves = new THREE.Mesh(treeGeo, leafMat);
      leaves.position.y = 4;
      leaves.castShadow = true;
      treeGroup.add(leaves);

      this.environmentGroup.add(treeGroup);
    }
  }

  public destroy(scene: THREE.Scene): void {
    scene.remove(this.environmentGroup);
    this.roadMesh.geometry.dispose();
    if (Array.isArray(this.roadMesh.material)) {
      this.roadMesh.material.forEach((m) => m.dispose());
    } else {
      this.roadMesh.material.dispose();
    }
    this.startLineMesh.geometry.dispose();
    if (Array.isArray(this.startLineMesh.material)) {
      this.startLineMesh.material.forEach((m) => m.dispose());
    } else {
      this.startLineMesh.material.dispose();
    }

    // Dispose obstacles, boost pads, checkpoints
    this.environmentGroup.traverse((child) => {
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
