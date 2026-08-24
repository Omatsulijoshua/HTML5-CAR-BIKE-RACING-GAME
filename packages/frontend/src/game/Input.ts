export class Input {
  public keys: {
    accelerate: boolean;
    brake: boolean;
    steerLeft: boolean;
    steerRight: boolean;
    nitro: boolean;
    drift: boolean;
    pause: boolean;
  } = {
    accelerate: false,
    brake: false,
    steerLeft: false,
    steerRight: false,
    nitro: false,
    drift: false,
    pause: false,
  };

  constructor() {
    window.addEventListener("keydown", (e) => this.handleKey(e, true));
    window.addEventListener("keyup", (e) => this.handleKey(e, false));
  }

  private handleKey(e: KeyboardEvent, isDown: boolean): void {
    switch (e.code) {
      case "KeyW":
      case "ArrowUp":
        this.keys.accelerate = isDown;
        break;
      case "KeyS":
      case "ArrowDown":
        this.keys.brake = isDown;
        break;
      case "KeyA":
      case "ArrowLeft":
        this.keys.steerLeft = isDown;
        break;
      case "KeyD":
      case "ArrowRight":
        this.keys.steerRight = isDown;
        break;
      case "Space":
        this.keys.nitro = isDown;
        break;
      case "ShiftLeft":
      case "ShiftRight":
        this.keys.drift = isDown;
        break;
      case "Escape":
        this.keys.pause = isDown;
        break;
    }
  }

  public getSteerValue(): number {
    let steer = 0;
    if (this.keys.steerLeft) steer -= 1;
    if (this.keys.steerRight) steer += 1;
    return steer;
  }
}
