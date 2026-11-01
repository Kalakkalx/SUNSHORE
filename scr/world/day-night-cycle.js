import * as THREE from "three";

const DAY_DURATION_SECONDS = 20 * 60;
const NIGHT_DURATION_SECONDS = 2 * 60;
const CYCLE_DURATION_SECONDS = DAY_DURATION_SECONDS + NIGHT_DURATION_SECONDS;
const HORIZON_SUN_HEIGHT = -0.12;
const HORIZON_ANGLE = Math.asin(HORIZON_SUN_HEIGHT);
const SUNRISE_TIME = (0.25 + (Math.PI * 2 + HORIZON_ANGLE) / (Math.PI * 2)) % 1;
const SUNSET_TIME = 0.25 + (Math.PI - HORIZON_ANGLE) / (Math.PI * 2);
const NIGHT_SKY = new THREE.Color(0x172332);
const DAY_SKY = new THREE.Color(0x94a9ac);
const NIGHT_FOG = new THREE.Color(0x263541);
const DAY_FOG = new THREE.Color(0xa7b2ae);
const MOON_TINT = new THREE.Color(0x92a9d2);
const SUN_TINT = new THREE.Color(0xffdfb0);

export class DayNightCycle {
  constructor(scene, catalog) {
    this.scene = scene;
    this.catalog = catalog;
    this.timeOfDay = 0.42;
    this.cycleSeconds = cycleSecondsForTime(this.timeOfDay);
    this.skyColor = new THREE.Color();
    this.fogColor = new THREE.Color();
    this.lightColor = new THREE.Color();
    this.daylight = 1;
  }

  update(deltaSeconds, playerPosition) {
    this.cycleSeconds = (this.cycleSeconds + deltaSeconds) % CYCLE_DURATION_SECONDS;
    if (this.cycleSeconds < DAY_DURATION_SECONDS) {
      const progress = this.cycleSeconds / DAY_DURATION_SECONDS;
      this.timeOfDay = SUNRISE_TIME + (SUNSET_TIME - SUNRISE_TIME) * progress;
    } else {
      const progress = (this.cycleSeconds - DAY_DURATION_SECONDS) / NIGHT_DURATION_SECONDS;
      const nightSpan = 1 - SUNSET_TIME + SUNRISE_TIME;
      this.timeOfDay = (SUNSET_TIME + nightSpan * progress) % 1;
    }
    const angle = (this.timeOfDay - 0.25) * Math.PI * 2;
    const sunHeight = Math.sin(angle);
    const horizon = THREE.MathUtils.clamp((sunHeight - HORIZON_SUN_HEIGHT) / 0.34, 0, 1);
    this.daylight = horizon * horizon * (3 - 2 * horizon);

    this.skyColor.copy(NIGHT_SKY).lerp(DAY_SKY, this.daylight);
    this.fogColor.copy(NIGHT_FOG).lerp(DAY_FOG, this.daylight);
    this.lightColor.copy(MOON_TINT).lerp(SUN_TINT, this.daylight);
    this.scene.background.copy(this.skyColor);
    this.scene.fog.color.copy(this.fogColor);

    const sun = this.scene.userData.sun;
    const hemisphere = this.scene.userData.hemisphere;
    sun.color.copy(this.lightColor);
    sun.intensity = 0.08 + this.daylight * 2.92;
    sun.castShadow = this.daylight > 0.2;
    sun.position.set(
      playerPosition.x + Math.cos(angle) * 320,
      sunHeight * 420,
      playerPosition.z + Math.sin(angle) * 280
    );
    sun.target.position.set(playerPosition.x, 0, playerPosition.z);
    hemisphere.intensity = 0.38 + this.daylight * 1.72;

    this.catalog.materials.headlight.emissiveIntensity =
      1.4 + (1 - this.daylight) * 3.2;
    this.catalog.materials.buildingGlass.emissiveIntensity =
      0.18 + (1 - this.daylight) * 0.72;
    this.catalog.materials.window.emissiveIntensity = 0.22 + (1 - this.daylight) * 0.88;
    this.catalog.materials.marquee.emissiveIntensity = 0.45 + (1 - this.daylight) * 1.25;
  }

  get clockLabel() {
    const totalMinutes = Math.floor(this.timeOfDay * 24 * 60);
    const hours = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
    const minutes = String(totalMinutes % 60).padStart(2, "0");
    return hours + ":" + minutes;
  }
}

function cycleSecondsForTime(timeOfDay) {
  const time = ((timeOfDay % 1) + 1) % 1;
  if (time >= SUNRISE_TIME && time < SUNSET_TIME) {
    return (time - SUNRISE_TIME) / (SUNSET_TIME - SUNRISE_TIME) * DAY_DURATION_SECONDS;
  }

  const nightSpan = 1 - SUNSET_TIME + SUNRISE_TIME;
  const elapsedNight = time >= SUNSET_TIME
    ? time - SUNSET_TIME
    : 1 - SUNSET_TIME + time;
  return DAY_DURATION_SECONDS + elapsedNight / nightSpan * NIGHT_DURATION_SECONDS;
}
