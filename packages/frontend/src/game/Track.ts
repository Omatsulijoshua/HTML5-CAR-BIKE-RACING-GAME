import * as THREE from "three";

export class Track {
  public curve: THREE.CatmullRomCurve3;
  private roadMesh!: THREE.Mesh;
  private startLineMesh!: THREE.Mesh;
  private environmentGroup: THREE.Group;

  constructor(scene: THREE.Scene) {
    this.environmentGroup = new THREE.Group();
    scene.add(this.environmentGroup);

    // 1. Create the track curve (a pleasant, winding layout)
    const points = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(30, 0, 15),
      new THREE.Vector3(60, 2, 0),       // includes a slight elevation ramp
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
  }

  private createRoad(): void {
    const roadWidth = 10;
    const roadThickness = 0.2;

    // Cross-section profile of the road
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

    // Add borders/curbs (white/red stripes)
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

    // Create visual stripes along the curbs
    for (let i = 0; i < steps; i++) {
      const isRed = i % 2 === 0;
      const curbMaterial = new THREE.MeshStandardMaterial({
        color: isRed ? 0xff3b30 : 0xffffff,
        roughness: 0.5,
      });

      // Left curb segment
      const p1Left = leftCurbPoints[i];
      const p2Left = leftCurbPoints[i + 1] || leftCurbPoints[0];
      this.createCurbSegment(p1Left, p2Left, curbHeight, curbWidth, curbMaterial);

      // Right curb segment
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

    // Position in center of segment
    const midpoint = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
    mesh.position.copy(midpoint);

    // Align with segment direction
    mesh.lookAt(p2);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    this.environmentGroup.add(mesh);
  }

  private createStartFinishLine(): void {
    // Checkered banner on the floor
    const width = 10;
    const length = 2;
    const geometry = new THREE.PlaneGeometry(width, length);

    // Custom checkerboard texture generated procedurally
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
    
    // Position at start of curve (t = 0)
    const startPoint = this.curve.getPointAt(0);
    const tangent = this.curve.getTangentAt(0);
    this.startLineMesh.position.copy(startPoint.clone().add(new THREE.Vector3(0, 0.11, 0))); // slightly above road to avoid z-fighting
    this.startLineMesh.lookAt(startPoint.clone().add(tangent));
    this.startLineMesh.rotateX(Math.PI / 2); // align plane rotation with curve normal

    this.environmentGroup.add(this.startLineMesh);
  }

  private createEnvironment(): void {
    // Add simple trees / barrier props
    const treeGeo = new THREE.ConeGeometry(2, 6, 8);
    const trunkGeo = new THREE.CylinderGeometry(0.4, 0.4, 2);
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.9 });
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5d4037, roughness: 0.9 });

    // Place trees off the track
    for (let i = 0; i < 40; i++) {
      const t = i / 40;
      const point = this.curve.getPointAt(t);
      const tangent = this.curve.getTangentAt(t);
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

      // Alternate sides and add offset
      const side = i % 2 === 0 ? 1 : -1;
      const distanceOffset = 12 + Math.random() * 8;
      const treePos = point.clone().add(normal.clone().multiplyScalar(side * distanceOffset));
      treePos.y = 0;

      // Group for the tree
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
  }
}
