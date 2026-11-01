import * as THREE from "three";
import { CONFIG } from "../config.js";
import { createHuman } from "../models/human-model.js";
import { coastlineAt } from "../world/road-network.js";

export class Player {
  constructor(scene, catalog, roads, input) {
    this.scene = scene;
    this.roads = roads;
    this.input = input;
    this.group = createHuman(catalog, catalog.materials.pedestrians[0], 1.08);
    this.group.position.set(CONFIG.playerStartX, 0, CONFIG.playerStartZ);
    this.group.rotation.y = 0;
    this.position = this.group.position;
    this.walkPhase = 0;
    this.movingAmount = 0;
    this.moveSpeed = 0;
    this.currentSpeed = 0;
    this.floorY = this.surfaceHeight(this.position.x, this.position.z);
    this.velocityY = 0;
    this.grounded = true;
    this.activeVehicle = null;
    this.inInterior = false;
    this.actionAnimation = null;
    this.turnRate = 0;
    this.headlightsOn = true;
    this.collisionCooldown = 0;
    this.health = 100;
    this.healthRegenDelay = 0;
    this.footHitCooldown = 0;
    this.group.position.y = this.floorY;
    this.scene.add(this.group);
    this.boats = null;
  }

  update(deltaSeconds, colliders) {
    this.regenerateHealth(deltaSeconds);

    if (this.actionAnimation) {
      this.updateActionAnimation(deltaSeconds);
      return;
    }
    const controls = this.input.getControls();

    if (this.activeVehicle) {
      this.input.consumeJumpRequest();
      this.driveVehicle(deltaSeconds, controls, colliders);
      return;
    }

    const currentFloor = this.inInterior
      ? 0.22
      : this.surfaceHeight(this.position.x, this.position.z);

    if (this.grounded) {
      this.floorY = currentFloor;
      this.group.position.y = this.floorY;
    }

    this.turnRate += (controls.turn * CONFIG.playerTurnSpeed - this.turnRate) *
      (1 - Math.exp(-deltaSeconds * 9));
    // Positive yaw turns the +Z heading toward +X, the player's right side.
    this.group.rotation.y += this.turnRate * deltaSeconds;

    const targetWalkSpeed = CONFIG.playerSpeed *
      (controls.sprinting ? CONFIG.runMultiplier : 1) * controls.forward;
    this.moveSpeed += (targetWalkSpeed - this.moveSpeed) * (1 - Math.exp(-deltaSeconds * 8));
    const distance = this.moveSpeed * deltaSeconds;
    const startX = this.position.x;
    const startZ = this.position.z;
    const moveX = Math.sin(this.group.rotation.y) * distance;
    const moveZ = Math.cos(this.group.rotation.y) * distance;
    const nextX = this.position.x + moveX;
    const nextZ = this.position.z + moveZ;

    if (this.canOccupy(nextX, this.position.z, colliders)) {
      this.position.x = nextX;
    }

    if (this.canOccupy(this.position.x, nextZ, colliders)) {
      this.position.z = nextZ;
    }

    this.currentSpeed = deltaSeconds > 0
      ? Math.hypot(this.position.x - startX, this.position.z - startZ) / deltaSeconds
      : 0;
    this.checkFootTrafficCollision(deltaSeconds);
    this.checkRespawn();

    this.floorY = this.inInterior
      ? 0.22
      : this.surfaceHeight(this.position.x, this.position.z);

    if (this.input.consumeJumpRequest() && this.grounded) {
      this.velocityY = CONFIG.jumpVelocity;
      this.grounded = false;
    }

    if (!this.grounded) {
      this.velocityY -= CONFIG.gravity * deltaSeconds;
      this.group.position.y += this.velocityY * deltaSeconds;

      if (this.group.position.y <= this.floorY) {
        this.group.position.y = this.floorY;
        this.velocityY = 0;
        this.grounded = true;
      }
    } else {
      this.group.position.y = this.floorY;
    }

    const isMoving = Math.abs(this.moveSpeed) > 0.08 &&
      (Math.abs(moveX) > 0.001 || Math.abs(moveZ) > 0.001);
    this.movingAmount = isMoving ? 1 : 0;

    if (isMoving) {
      this.walkPhase += deltaSeconds * (controls.sprinting ? 15 : 9.6) *
        Math.sign(controls.forward);
    }

    this.group.userData.animateWalk(this.walkPhase, this.movingAmount);

    if (!this.grounded) {
      const limbs = this.group.userData.limbs;
      limbs.leftLeg.rotation.x = -0.35;
      limbs.rightLeg.rotation.x = -0.35;
      limbs.leftArm.rotation.x = 0.45;
      limbs.rightArm.rotation.x = -0.45;
    }
  }

  enterVehicle(vehicle) {
    if (!vehicle || vehicle.controlled || this.actionAnimation) {
      return false;
    }

    vehicle.controlled = true;
    vehicle.parked = false;
    for (const light of vehicle.group.userData.headlights ?? []) light.visible = this.headlightsOn;
    const heading = vehicle.group.rotation.y;
    const sideX = Math.cos(heading) * 2.3;
    const sideZ = -Math.sin(heading) * 2.3;
    this.actionAnimation = {
      type: "enter", elapsed: 0, duration: 0.52, vehicle,
      start: this.position.clone(),
      end: new THREE.Vector3(vehicle.group.position.x + sideX, vehicle.group.position.y, vehicle.group.position.z + sideZ),
      heading
    };
    return true;
  }

  exitVehicle(colliders) {
    const vehicle = this.activeVehicle;

    if (!vehicle || this.actionAnimation) {
      return false;
    }

    const heading = vehicle.group.rotation.y;
    const sideX = Math.cos(heading) * 2.5;
    const sideZ = -Math.sin(heading) * 2.5;
    const candidates = [
      { x: vehicle.group.position.x + sideX, z: vehicle.group.position.z + sideZ },
      { x: vehicle.group.position.x - sideX, z: vehicle.group.position.z - sideZ },
      {
        x: vehicle.group.position.x - Math.sin(heading) * 3.2,
        z: vehicle.group.position.z - Math.cos(heading) * 3.2
      }
    ];
    const exitPoint = candidates.find(({ x, z }) => this.canOccupy(x, z, colliders, CONFIG.playerRadius, "land"));

    if (!exitPoint) {
      return false;
    }

    this.activeVehicle = null;
    this.group.visible = true;
    const startPoint = new THREE.Vector3(
      vehicle.group.position.x + sideX * 0.45,
      vehicle.group.position.y,
      vehicle.group.position.z + sideZ * 0.45
    );
    this.group.position.copy(startPoint);
    this.actionAnimation = {
      type: "exit", elapsed: 0, duration: 0.46, vehicle,
      start: startPoint,
      end: new THREE.Vector3(exitPoint.x, this.surfaceHeight(exitPoint.x, exitPoint.z), exitPoint.z),
      heading
    };
    return true;
  }

  updateActionAnimation(deltaSeconds) {
    const animation = this.actionAnimation;
    animation.elapsed += deltaSeconds;
    const raw = Math.min(animation.elapsed / animation.duration, 1);
    const eased = raw * raw * (3 - 2 * raw);
    this.position.lerpVectors(animation.start, animation.end, eased);
    this.group.rotation.y = animation.heading;

    if (raw < 1) return;
    if (animation.type === "enter") {
      this.activeVehicle = animation.vehicle;
      this.position.copy(animation.vehicle.group.position);
      this.group.visible = false;
    } else {
      animation.vehicle.controlled = false;
      animation.vehicle.parked = true;
      this.floorY = this.position.y;
      this.grounded = true;
      this.velocityY = 0;
    }
    this.actionAnimation = null;
  }

  toggleHeadlights() {
    this.headlightsOn = !this.headlightsOn;
    if (this.activeVehicle) {
      for (const light of this.activeVehicle.group.userData.headlights ?? []) {
        light.visible = this.headlightsOn;
      }
    }
    return this.headlightsOn;
  }

  driveVehicle(deltaSeconds, controls, colliders) {
    const vehicle = this.activeVehicle;

    const kind = vehicle.type;
    const passengerCar = ["car", "compact", "sedan", "taxi", "sports", "mustang", "courier", "heritage-gt", "cortina", "shelby-police"].includes(kind);
    const topSpeed = passengerCar ? CONFIG.vehicleTopSpeedKmh / 3.6 : kind === "boat" ? 24 : kind === "bicycle" ? 22 : ["motorcycle", "bike"].includes(kind) ? 40 :
      kind === "scooter" ? 27 : kind === "bus" ? 20 : ["pickup", "raptor", "van", "delivery", "service", "fire"].includes(kind) ? 26 : 34;
    const reverseSpeed = passengerCar ? 30 : topSpeed * 0.24;
    const conditionRatio = THREE.MathUtils.clamp((vehicle.condition ?? 100) / 100, 0, 1);
    // A wrecked car should feel damaged, but a crash must never permanently
    // disable its engine or leave the player stranded.
    const damagePerformance = 0.45 + conditionRatio * 0.55;
    const boosted = controls.sprinting && controls.forward > 0;
    const targetSpeed = controls.forward > 0 ? topSpeed * damagePerformance :
      controls.forward < 0 ? -reverseSpeed * damagePerformance : 0;
    const brake = Math.sign(vehicle.speed) !== Math.sign(targetSpeed) && Math.abs(vehicle.speed) > 1;
    const acceleration = (brake ? 24 : kind === "boat" ? 5 : kind === "bus" || kind === "fire" ? 6 : passengerCar ? 16 : kind === "bicycle" ? 7 : 11) *
      (boosted && !brake ? CONFIG.vehicleBoostMultiplier : 1) *
      (0.55 + conditionRatio * 0.45);
    vehicle.speed += Math.sign(targetSpeed - vehicle.speed) *
      Math.min(Math.abs(targetSpeed - vehicle.speed), acceleration * deltaSeconds);
    vehicle.speed = Math.abs(vehicle.speed) < 0.12 && targetSpeed === 0 ? 0 : vehicle.speed;

    const steeringGrip = kind === "boat" ? 0.72 : kind === "sports" ? 2.05 : ["motorcycle", "bike", "scooter"].includes(kind) ? 1.9 : kind === "bus" ? 0.78 : 1.35;
    const speedFactor = 0.24 + 0.76 * Math.min(Math.abs(vehicle.speed) / Math.max(topSpeed, 1), 1);
    vehicle.group.rotation.y += controls.turn * steeringGrip * speedFactor * deltaSeconds;

    const distance = vehicle.speed * deltaSeconds;
    const startX = vehicle.group.position.x;
    const startZ = vehicle.group.position.z;
    const heading = vehicle.group.rotation.y;
    const moveX = Math.sin(heading) * distance;
    const moveZ = Math.cos(heading) * distance;

    // Filter static colliders once for the whole swept path. Each stepped
    // collision query then checks only buildings intersecting this path AABB.
    let movementColliders = colliders;
    if (!this.inInterior && kind !== "boat" && colliders.length > 0) {
      const minX = Math.min(startX, startX + moveX) - CONFIG.vehicleRadius;
      const maxX = Math.max(startX, startX + moveX) + CONFIG.vehicleRadius;
      const minZ = Math.min(startZ, startZ + moveZ) - CONFIG.vehicleRadius;
      const maxZ = Math.max(startZ, startZ + moveZ) + CONFIG.vehicleRadius;
      movementColliders = [];
      for (const collider of colliders) {
        if (collider.minX < maxX && collider.maxX > minX &&
            collider.minZ < maxZ && collider.maxZ > minZ) {
          movementColliders.push(collider);
        }
      }
    }

    const steps = Math.max(1, Math.ceil(Math.abs(distance) / CONFIG.vehicleRadius));
    const stepX = moveX / steps;
    const stepZ = moveZ / steps;
    let collided = false;

    for (let step = 0; step < steps; step += 1) {
      const candidateX = vehicle.group.position.x + stepX;
      const candidateZ = vehicle.group.position.z + stepZ;
      const canMoveX = this.canOccupy(candidateX, vehicle.group.position.z, movementColliders, CONFIG.vehicleRadius) &&
        this.clearOfTraffic(vehicle, candidateX, vehicle.group.position.z);
      if (canMoveX) {
        vehicle.group.position.x = candidateX;
      } else {
        collided = true;
      }

      const canMoveZ = this.canOccupy(vehicle.group.position.x, candidateZ, movementColliders, CONFIG.vehicleRadius) &&
        this.clearOfTraffic(vehicle, vehicle.group.position.x, candidateZ);
      if (canMoveZ) {
        vehicle.group.position.z = candidateZ;
      } else {
        collided = true;
      }

      if (collided) break;
    }
    if (collided && Math.abs(vehicle.speed) > 5) this.hitVehicle(vehicle, deltaSeconds);

    this.position.copy(vehicle.group.position);
    if (kind === "boat") {
      vehicle.group.position.y = -0.02 + Math.sin(performance.now() * 0.0014) * 0.07;
    } else {
      vehicle.group.position.y = this.surfaceHeight(vehicle.group.position.x, vehicle.group.position.z);
    }
    this.position.y = vehicle.group.position.y;
    this.group.rotation.y = heading;
    this.currentSpeed = deltaSeconds > 0
      ? Math.hypot(
        vehicle.group.position.x - startX,
        vehicle.group.position.z - startZ
      ) / deltaSeconds
      : 0;
    if (this.collisionCooldown > 0) this.collisionCooldown -= deltaSeconds;
    this.checkRespawn();
  }

  hitVehicle(vehicle, deltaSeconds) {
    if (this.collisionCooldown > 0) return;
    const impactForce = Math.abs(vehicle.speed);
    vehicle.condition = Math.max(0, vehicle.condition - Math.max(7, impactForce * 0.8));
    vehicle.group.userData.setCondition?.(vehicle.condition);
    this.health = Math.max(0, this.health - Math.min(20, impactForce * 0.5));
    this.healthRegenDelay = 3;
    vehicle.speed *= -0.12;
    this.collisionCooldown = 0.8;
  }

  clearOfTraffic(vehicle, x, z) {
    let clear = true;
    const checkVehicle = (other) => {
      if (other === vehicle || other.stored) return;
      const radius = other.type === "bus" || other.type === "truck" ? 4.4 : 3.1;
      const dx = other.group.position.x - x;
      const dz = other.group.position.z - z;
      if (dx * dx + dz * dz < (radius + CONFIG.vehicleRadius * 0.45) ** 2) {
        clear = false;
        if (vehicle === this.activeVehicle) {
          this.traffic?.bumpVehicle(other, dx, dz, Math.abs(vehicle.speed));
        }
        return false;
      }
    };
    this.traffic?.forEachVehicleNear(x, z, 6, checkVehicle);
    if (clear) {
      for (const boat of this.boats?.vehicles ?? []) {
        if (boat === vehicle || !boat.group.visible || boat.stored) continue;
        if ((boat.group.position.x - x) ** 2 + (boat.group.position.z - z) ** 2 <
            (3.1 + CONFIG.vehicleRadius * 0.45) ** 2) { clear = false; break; }
      }
    }
    return clear;
  }

  checkFootTrafficCollision(deltaSeconds) {
    this.footHitCooldown = Math.max(0, this.footHitCooldown - deltaSeconds);
    let nearbyVehicle = null;
    this.traffic?.forEachVehicleNear(this.position.x, this.position.z, 2.7, (vehicle) => {
      if (nearbyVehicle || !vehicle.group.visible || vehicle.parked || vehicle.controlled ||
          Math.abs(vehicle.speed) < 4) return;
      const dx = this.position.x - vehicle.group.position.x;
      const dz = this.position.z - vehicle.group.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance <= 2.7) nearbyVehicle = { dx, dz, distance, vehicle };
    });

    if (!nearbyVehicle) return;
    const { dx, dz, distance, vehicle } = nearbyVehicle;
    if (this.footHitCooldown <= 0) {
      this.health = Math.max(0, this.health - Math.min(35, Math.abs(vehicle.speed) * 0.8));
      this.healthRegenDelay = 4;
      this.footHitCooldown = 1.1;
    }
    if (distance > 0.001) {
      this.position.x += dx / distance * (2.8 - distance);
      this.position.z += dz / distance * (2.8 - distance);
    }
  }

  regenerateHealth(deltaSeconds) {
    if (this.healthRegenDelay > 0) {
      this.healthRegenDelay -= deltaSeconds;
      return;
    }
    if (this.health < 100) {
      this.health = Math.min(100, this.health + 8 * deltaSeconds);
    }
  }

  checkRespawn() {
    if (this.health <= 0) {
      if (this.activeVehicle) {
        this.activeVehicle.controlled = false;
        this.activeVehicle.parked = true;
        this.activeVehicle = null;
      }
      const startX = CONFIG.playerStartX;
      const startZ = CONFIG.playerStartZ;
      const startY = this.surfaceHeight(startX, startZ);
      this.position.set(startX, startY, startZ);
      this.group.visible = true;
      this.health = 100;
      this.velocityY = 0;
      this.grounded = true;
      this.moveSpeed = 0;
      this.currentSpeed = 0;
      this.floorY = startY;
    }
  }

  canOccupy(x, z, colliders, radius = CONFIG.playerRadius, surface = "auto") {
    if (this.inInterior) {
      return x > -15.8 + radius &&
        x < 15.8 - radius &&
        z > -12.8 + radius &&
        z < 12.8 - radius;
    }

    const onBoat = surface !== "land" && this.activeVehicle?.type === "boat";
    if (onBoat ? !this.roads.isNavigableWater(x, z) : !this.roads.isOnLand(x, z)) {
      return false;
    }

    if (onBoat) return true;
    if (this.roads.summitTerrainHeightAt?.(x, z) > 0 &&
        this.roads.mountainRoadHeightAt?.(x, z) == null) {
      return false;
    }

    for (const collider of colliders) {
      if (
        x + radius > collider.minX &&
        x - radius < collider.maxX &&
        z + radius > collider.minZ &&
        z - radius < collider.maxZ
      ) {
        return false;
      }
    }

    return true;
  }

  surfaceHeight(x, z) {
    const mountainRoadHeight = this.roads.mountainRoadHeightAt?.(x, z);
    if (mountainRoadHeight !== null && mountainRoadHeight !== undefined) {
      return mountainRoadHeight;
    }

    const size = CONFIG.blockSize;
    const cellX = Math.floor(x / size);
    const cellZ = Math.floor(z / size);
    let sidewalkHeight = -0.02;
    const onDock = [2400, 2580, 2760].some((dockX) =>
      Math.abs(x - dockX) <= 6.4 &&
      z > coastlineAt(dockX) - 84 && z < coastlineAt(dockX) + 360
    );
    if (onDock) sidewalkHeight = 0.43;

    for (let gridZ = cellZ - 1; gridZ <= cellZ + 1; gridZ += 1) {
      for (let gridX = cellX - 1; gridX <= cellX + 1; gridX += 1) {
        const horizontal = this.roads.getEdge("horizontal", gridX, gridZ);
        const vertical = this.roads.getEdge("vertical", gridX, gridZ);

        if (horizontal) {
          const along = x >= horizontal.startX - horizontal.width * 0.55 &&
            x <= horizontal.endX + horizontal.width * 0.55;
          const lateral = Math.abs(z - horizontal.centerZ);

          if (along && lateral <= horizontal.width * 0.5) {
            return CONFIG.roadHeight;
          }

          if (along && lateral <= horizontal.width * 0.5 + CONFIG.sidewalkWidth) {
            sidewalkHeight = Math.max(sidewalkHeight, CONFIG.sidewalkHeight);
          }
        }

        if (vertical) {
          const along = z >= vertical.startZ - vertical.width * 0.55 &&
            z <= vertical.endZ + vertical.width * 0.55;
          const lateral = Math.abs(x - vertical.centerX);

          if (along && lateral <= vertical.width * 0.5) {
            return CONFIG.roadHeight;
          }

          if (along && lateral <= vertical.width * 0.5 + CONFIG.sidewalkWidth) {
            sidewalkHeight = Math.max(sidewalkHeight, CONFIG.sidewalkHeight);
          }
        }
      }
    }

    return sidewalkHeight;
  }
}
