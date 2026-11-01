export class AudioManager {
  constructor() {
    this.context = null;
    this.master = null;
    this.engineGain = null;
    this.enginePitch = null;
    this.trafficGain = null;
    this.ambientGain = null;
    this.radioGain = null;
    this.radioPitch = null;
    this.radioOn = false;
    this.footstepClock = 0;
    this.started = false;
    this.unlock = () => this.ensureAudio();
    window.addEventListener("pointerdown", this.unlock, { once: true });
    window.addEventListener("keydown", this.unlock, { once: true });
  }

  ensureAudio() {
    if (!this.context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = 0.3;
      this.master.connect(this.context.destination);
      this.engineGain = this.makeDrone(62, "sawtooth", 0.0001);
      this.enginePitch = this.engineGain.oscillator.frequency;
      this.trafficGain = this.makeDrone(43, "triangle", 0.012);
      this.ambientGain = this.makeDrone(84, "sine", 0.006);
      const radio = this.makeDrone(220, "triangle", 0);
      this.radioGain = radio.gain;
      this.radioPitch = radio.oscillator.frequency;
      this.started = true;
    }
    if (this.context.state === "suspended") this.context.resume().catch(() => {});
  }

  makeDrone(frequency, type, volume) {
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.value = volume;
    oscillator.connect(gain);
    gain.connect(this.master);
    oscillator.start();
    return { oscillator, gain };
  }

  update({ driving = false, speed = 0, walking = false, district = "city", night = 0, deltaSeconds = 1 / 60 }) {
    if (!this.context) return;
    const now = this.context.currentTime;
    const moving = Math.abs(speed);
    this.engineGain.gain.gain.setTargetAtTime(driving ? 0.045 + Math.min(moving / 80, 0.05) : 0.0001, now, 0.22);
    this.enginePitch.setTargetAtTime(48 + moving * 3.1, now, 0.18);
    const districtVolume = district === "OCEANFRONT" || district === "SOUTH HARBOR" ? 0.009 : 0.014;
    this.trafficGain.gain.gain.setTargetAtTime(districtVolume, now, 0.8);
    const ambientPitch = district === "OCEANFRONT" || district === "SOUTH HARBOR" ? 72 :
      district === "SUMMIT TRAIL" ? 118 : district === "CYPRESS PARK" ? 130 :
        district === "AIRFIELD" ? 52 : district === "DOWNTOWN" ? 102 : 88;
    this.ambientGain.oscillator.frequency.setTargetAtTime(ambientPitch + night * 7, now, 1.4);
    this.ambientGain.gain.gain.setTargetAtTime(0.004 + night * 0.002, now, 1.2);
    this.footstepClock -= deltaSeconds;
    if (walking && moving > 1 && this.footstepClock <= 0) {
      this.footstepClock = 0.42;
      this.playTone(78 + Math.random() * 18, 0.018, 0.055, "triangle");
    }
    if (this.radioOn) this.radioPitch.setTargetAtTime(180 + 85 * Math.sin(now * 1.6), now, 0.2);
  }

  playHorn() {
    this.playTone(310, 0.14, 0.38, "sawtooth");
    this.playTone(418, 0.1, 0.35, "sawtooth");
  }

  playTone(frequency, volume, duration, type = "sine") {
    this.ensureAudio();
    if (!this.context) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const now = this.context.currentTime;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.03);
  }

  toggleRadio() {
    this.ensureAudio();
    this.radioOn = !this.radioOn;
    if (this.context) this.radioGain.gain.setTargetAtTime(this.radioOn ? 0.025 : 0, this.context.currentTime, 0.12);
    return this.radioOn;
  }
}
