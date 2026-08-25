import * as THREE from "three";

interface ActiveParticle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
}

export class ParticleSystem {
  public group: THREE.Group;
  private particles: ActiveParticle[] = [];

  // Reusable geometries and materials to avoid allocations
  private smokeGeometry: THREE.BoxGeometry;
  private sparkGeometry: THREE.BoxGeometry;

  private smokeMaterial: THREE.MeshBasicMaterial;
  private sparkMaterial: THREE.MeshBasicMaterial;

  constructor(scene: THREE.Scene) {
    this.group = new THREE.Group();
    scene.add(this.group);

    // Small boxes representing low-poly particles
    this.smokeGeometry = new THREE.BoxGeometry(0.25, 0.25, 0.25);
    this.sparkGeometry = new THREE.BoxGeometry(0.12, 0.12, 0.12);

    this.smokeMaterial = new THREE.MeshBasicMaterial({
      color: 0xcccccc,
      transparent: true,
      opacity: 0.6,
    });

    this.sparkMaterial = new THREE.MeshBasicMaterial({
      color: 0x007aff, // Cyan-blue sparks for nitro
      transparent: true,
      opacity: 0.95,
    });
  }

  public spawnTireSmoke(position: THREE.Vector3, velocity: THREE.Vector3): void {
    const mesh = new THREE.Mesh(this.smokeGeometry, this.smokeMaterial.clone());
    mesh.position.copy(position);
    
    // Slight random scale
    const scale = 0.5 + Math.random() * 0.8;
    mesh.scale.setScalar(scale);

    this.group.add(mesh);

    this.particles.push({
      mesh,
      velocity: velocity.clone().add(new THREE.Vector3(
        (Math.random() - 0.5) * 1.5,
        0.5 + Math.random() * 1.0,
        (Math.random() - 0.5) * 1.5
      )),
      life: 0.5 + Math.random() * 0.4,
      maxLife: 0.9,
    });
  }

  public spawnNitroFlame(position: THREE.Vector3, velocity: THREE.Vector3): void {
    // Generate a hot orange/cyan spark particle
    const color = Math.random() < 0.45 ? 0x007aff : Math.random() < 0.8 ? 0x39ff14 : 0xffcc00;
    const material = this.sparkMaterial.clone();
    material.color.setHex(color);

    const mesh = new THREE.Mesh(this.sparkGeometry, material);
    mesh.position.copy(position);

    this.group.add(mesh);

    this.particles.push({
      mesh,
      velocity: velocity.clone().add(new THREE.Vector3(
        (Math.random() - 0.5) * 2.5,
        (Math.random() - 0.5) * 1.5,
        (Math.random() - 0.5) * 2.5
      )),
      life: 0.25 + Math.random() * 0.2,
      maxLife: 0.45,
    });
  }

  public update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;

      if (p.life <= 0) {
        this.group.remove(p.mesh);
        p.mesh.geometry.dispose();
        if (p.mesh.material instanceof THREE.Material) {
          p.mesh.material.dispose();
        }
        this.particles.splice(i, 1);
      } else {
        // Move particle
        p.mesh.position.addScaledVector(p.velocity, dt);

        // Slow down velocity (air resistance)
        p.velocity.multiplyScalar(0.96);

        // Shrink and fade
        const ratio = p.life / p.maxLife;
        p.mesh.scale.setScalar(ratio);
        
        if (p.mesh.material instanceof THREE.MeshBasicMaterial) {
          p.mesh.material.opacity = ratio * 0.8;
        }
      }
    }
  }

  public clear(): void {
    this.particles.forEach((p) => {
      this.group.remove(p.mesh);
      p.mesh.geometry.dispose();
      if (p.mesh.material instanceof THREE.Material) {
        p.mesh.material.dispose();
      }
    });
    this.particles = [];
  }
}
