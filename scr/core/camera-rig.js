import * as THREE from "three";
import { CONFIG } from "../config.js";

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.position = new THREE.Vector3();
    this.lookTarget = new THREE.Vector3();
    this.distance = CONFIG.cameraDistance;
    this.initialized = false;
  }

  zoom(wheelDelta) {
    this.distance = THREE.MathUtils.clamp(
      this.distance + Math.sign(wheelDelta) * 1.2,
      5,
      22
    );
  }

  update(player, deltaSeconds) {
    const heading = player.group.rotation.y;
    const targetX = player.group.position.x;
    const targetZ = player.group.position.z;
    const driving = Boolean(player.activeVehicle);
    const vehicleSpeed = driving ? Math.abs(player.activeVehicle.speed ?? 0) : 0;
    const followDistance = this.distance + (driving ? 2.8 + Math.min(vehicleSpeed * 0.045, 3.2) : 0);
    const desiredX = targetX - Math.sin(heading) * followDistance;
    const desiredZ = targetZ - Math.cos(heading) * followDistance;
    const desiredY = CONFIG.cameraHeight + player.group.position.y + (driving ? 1.1 : 0);
    const smoothing = 1 - Math.exp(-deltaSeconds * (driving ? 4.2 : 5.5));

    this.position.set(desiredX, desiredY, desiredZ);
    if (!this.initialized) {
      this.camera.position.copy(this.position);
      this.initialized = true;
    } else {
      this.camera.position.lerp(this.position, smoothing);
    }

    this.lookTarget.set(targetX, (driving ? 1.55 : CONFIG.cameraLookHeight) + player.group.position.y, targetZ);
    this.camera.lookAt(this.lookTarget);
  }
}
