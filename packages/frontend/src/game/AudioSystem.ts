export class AudioSystem {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  // Engine synthesizer
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;

  // Drift screech synthesizer
  private driftNoise: AudioBufferSourceNode | null = null;
  private driftGain: GainNode | null = null;
  private driftNoiseBuffer: AudioBuffer | null = null;

  // Boost buzz synthesizer
  private boostOsc: OscillatorNode | null = null;
  private boostGain: GainNode | null = null;

  private isStarted = false;

  constructor() {
    // Audio Context is initialized suspended until a user gesture triggers resume
  }

  public init(): void {
    if (this.isStarted) return;

    try {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Setup master volume
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.25, this.ctx.currentTime); // moderate master volume
      this.masterGain.connect(this.ctx.destination);

      this.initEngineSynth();
      this.initDriftSynth();
      this.initBoostSynth();

      this.isStarted = true;
      console.log("Web Audio API System initialized successfully.");
    } catch (e) {
      console.warn("Failed to initialize Web Audio API:", e);
    }
  }

  public resume(): void {
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().then(() => {
        console.log("Audio Context resumed.");
      });
    }
  }

  private initEngineSynth(): void {
    if (!this.ctx || !this.masterGain) return;

    // Sawtooth oscillator for mechanical rumble
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = "sawtooth";
    this.engineOsc.frequency.setValueAtTime(70, this.ctx.currentTime);

    // Low-pass filter to cut high-end buzz
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(280, this.ctx.currentTime);

    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.setValueAtTime(0.0, this.ctx.currentTime); // start silent

    // Connect: Osc -> Filter -> Gain -> Master
    this.engineOsc.connect(filter);
    filter.connect(this.engineGain);
    this.engineGain.connect(this.masterGain);

    this.engineOsc.start();
  }

  private initDriftSynth(): void {
    if (!this.ctx || !this.masterGain) return;

    // 1. Create a 1-second white noise buffer
    const bufferSize = this.ctx.sampleRate;
    this.driftNoiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const channelData = this.driftNoiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      channelData[i] = Math.random() * 2 - 1;
    }

    // 2. Play white noise source
    this.driftNoise = this.ctx.createBufferSource();
    this.driftNoise.buffer = this.driftNoiseBuffer;
    this.driftNoise.loop = true;

    // 3. Bandpass filter around screech frequencies (800Hz - 1500Hz)
    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(1100, this.ctx.currentTime);
    filter.Q.setValueAtTime(2.0, this.ctx.currentTime);

    this.driftGain = this.ctx.createGain();
    this.driftGain.gain.setValueAtTime(0.0, this.ctx.currentTime); // silent initially

    // Connect: Source -> Filter -> Gain -> Master
    this.driftNoise.connect(filter);
    filter.connect(this.driftGain);
    this.driftGain.connect(this.masterGain);

    this.driftNoise.start();
  }

  private initBoostSynth(): void {
    if (!this.ctx || !this.masterGain) return;

    // Triangle oscillator for a clean electric hum
    this.boostOsc = this.ctx.createOscillator();
    this.boostOsc.type = "triangle";
    this.boostOsc.frequency.setValueAtTime(440, this.ctx.currentTime);

    this.boostGain = this.ctx.createGain();
    this.boostGain.gain.setValueAtTime(0.0, this.ctx.currentTime); // silent

    this.boostOsc.connect(this.boostGain);
    this.boostGain.connect(this.masterGain);

    this.boostOsc.start();
  }

  public updateEngineSound(speedRatio: number, isAccelerating: boolean): void {
    if (!this.ctx || !this.engineOsc || !this.engineGain) return;

    // Pitch changes based on speed
    const baseFreq = 65;
    const accelPitchMod = isAccelerating ? 25 : 0;
    const targetFreq = baseFreq + speedRatio * 180 + accelPitchMod;
    
    // Smooth transition
    this.engineOsc.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.08);

    // Gain changes based on speed
    const targetGain = 0.06 + speedRatio * 0.08;
    this.engineGain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.1);
  }

  public setDriftingSound(active: boolean): void {
    if (!this.ctx || !this.driftGain) return;

    const targetGain = active ? 0.09 : 0.0;
    this.driftGain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.05);
  }

  public setBoostSound(active: boolean): void {
    if (!this.ctx || !this.boostGain || !this.boostOsc) return;

    const targetGain = active ? 0.12 : 0.0;
    this.boostGain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.1);
    
    if (active) {
      // Frequency sweeping upward during boosts
      this.boostOsc.frequency.setValueAtTime(320, this.ctx.currentTime);
      this.boostOsc.frequency.exponentialRampToValueAtTime(780, this.ctx.currentTime + 0.85);
    }
  }

  public playCollisionSound(): void {
    if (!this.ctx || !this.masterGain || this.ctx.state === "suspended") return;

    const time = this.ctx.currentTime;

    // Create dynamic low-frequency impact oscillator (thud)
    const impactOsc = this.ctx.createOscillator();
    impactOsc.type = "triangle";
    impactOsc.frequency.setValueAtTime(160, time);
    impactOsc.frequency.exponentialRampToValueAtTime(40, time + 0.28);

    const impactGain = this.ctx.createGain();
    impactGain.gain.setValueAtTime(0.35, time);
    impactGain.gain.exponentialRampToValueAtTime(0.001, time + 0.28);

    impactOsc.connect(impactGain);
    impactGain.connect(this.masterGain);

    impactOsc.start(time);
    impactOsc.stop(time + 0.3);

    // Create high-frequency metal/noise crash element
    const crashOsc = this.ctx.createOscillator();
    crashOsc.type = "sawtooth";
    crashOsc.frequency.setValueAtTime(240, time);
    crashOsc.frequency.setValueAtTime(10, time + 0.15);

    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(1000, time);

    const crashGain = this.ctx.createGain();
    crashGain.gain.setValueAtTime(0.18, time);
    crashGain.gain.exponentialRampToValueAtTime(0.001, time + 0.2);

    crashOsc.connect(filter);
    filter.connect(crashGain);
    crashGain.connect(this.masterGain);

    crashOsc.start(time);
    crashOsc.stop(time + 0.22);
  }
}
