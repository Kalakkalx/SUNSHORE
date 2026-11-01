import { CONFIG } from "../config.js";
import { seededRandom } from "../core/random.js";
import { SpatialGrid } from "../core/spatial-grid.js";
import { createHuman } from "../models/human-model.js";

export class PedestrianSystem {
  constructor(scene, seed, catalog, roads, player) {
    this.scene = scene;
    this.seed = seed;
    this.catalog = catalog;
    this.roads = roads;
    this.player = player;
    this.people = [];
    this.spatialIndex = new SpatialGrid(32);
    this.random = seededRandom(seed, 31, 88, 0x63c167e1);
    this.createInitialPeople();
    this.rebuildSpatialIndex();
  }

  createInitialPeople() {
    for (let index = 0; index < CONFIG.pedestrianCount; index += 1) {
      const shirt = this.catalog.materials.pedestrians[
        1 + Math.floor(this.random() * (this.catalog.materials.pedestrians.length - 1))
      ];
      const appearance = {
        skin: this.catalog.materials.skins[Math.floor(this.random() * this.catalog.materials.skins.length)],
        hair: this.catalog.materials.hairColors[Math.floor(this.random() * this.catalog.materials.hairColors.length)],
        pants: this.catalog.materials.buildings[Math.floor(this.random() * this.catalog.materials.buildings.length)],
        backpack: this.random() > 0.68,
        hat: this.random() > 0.74
      };
      const human = createHuman(this.catalog, shirt, 0.86 + this.random() * 0.27, appearance);
      const person = {
        group: human,
        speed: 1 + this.random() * 0.75,
        phase: this.random() * Math.PI * 2,
        side: this.random() > 0.5 ? 1 : -1,
        progress: 0,
        fromX: 0,
        fromZ: 0,
        toX: 0,
        toZ: 0,
        edge: null,
        index,
        destinationX: 0,
        destinationZ: 0,
        walkSpeed: 1 + this.random() * 0.75,
        alertTimer: 0,
        impactCooldown: 0,
        knockback: null
      };

      this.scene.add(human);
      this.people.push(person);
      this.placeOnNearbyRoad(person, this.player.position, index * 13.1);
    }
  }

  update(deltaSeconds, playerPosition, traffic = null, timeOfDay = 0.5, district = "CITY") {
    const busyHour = Math.max(
      Math.exp(-Math.pow((timeOfDay - 0.32) / 0.09, 2)),
      Math.exp(-Math.pow((timeOfDay - 0.72) / 0.1, 2))
    );
    const localFlow = district === "CYPRESS PARK" || district === "SOUTH HARBOR" ? 0.78 :
      district === "AIRFIELD" || district === "SUMMIT TRAIL" ? 0.3 : 1;
    // Keep the full 500-person population pool, but only animate a nearby
    // crowd-sized subset at once to avoid hundreds of collision checks per frame.
    const activeCrowd = Math.min(CONFIG.pedestrianCount, 60);
    const limit = Math.round(activeCrowd * (0.8 + busyHour * 0.2) * localFlow);
    for (const person of this.people) {
      if (person.index >= limit) {
        person.group.visible = false;
        continue;
      }
      if (!person.group.visible) {
        person.placementRetryIn = Math.max(0, (person.placementRetryIn ?? 0) - deltaSeconds);
        if (person.placementRetryIn > 0) continue;
        this.placeOnNearbyRoad(person, playerPosition, person.index * 18.7);
        if (!person.group.visible) {
          // Roadless areas can otherwise make every hidden pedestrian scan the
          // whole placement radius on every animation frame.
          person.placementRetryIn = 1.5;
          continue;
        }
      }

      person.impactCooldown = Math.max(0, person.impactCooldown - deltaSeconds);
      if (person.knockback) {
        this.updateKnockback(person, deltaSeconds);
        continue;
      }

      let wasHit = this.applyVehicleImpact(person, this.player.activeVehicle);
      if (!wasHit) {
        traffic?.forEachVehicleNear(
          person.group.position.x,
          person.group.position.z,
          9,
          (vehicle) => {
            if (vehicle === this.player.activeVehicle) return;
            if (this.applyVehicleImpact(person, vehicle)) {
              wasHit = true;
              return false;
            }
          }
        );
      }
      if (wasHit) {
        this.updateKnockback(person, deltaSeconds);
        continue;
      }

      const nearbyVehicle = traffic?.findVehicleNear(person.group.position, 9);
      if (nearbyVehicle) {
        person.alertTimer = 1.2;
        person.group.rotation.y = Math.atan2(
          person.group.position.x - nearbyVehicle.group.position.x,
          person.group.position.z - nearbyVehicle.group.position.z
        );
      } else if (traffic?.incident && Math.hypot(
        person.group.position.x - traffic.incident.group.children[0].position.x,
        person.group.position.z - traffic.incident.group.children[0].position.z
      ) < 24) {
        person.alertTimer = 1.6;
      }
      person.alertTimer = Math.max(0, person.alertTimer - deltaSeconds);
      const desiredSpeed = person.alertTimer > 0 ? 0 : person.walkSpeed;
      person.speed += (desiredSpeed - person.speed) * Math.min(1, deltaSeconds * 4);
      person.progress += person.speed * deltaSeconds / CONFIG.blockSize;

      while (person.progress >= 1) {
        person.progress -= 1;
        this.advanceRoute(person);
      }

      this.positionPerson(person, deltaSeconds);

      const distance = Math.hypot(
        person.group.position.x - playerPosition.x,
        person.group.position.z - playerPosition.z
      );

      if (distance > CONFIG.pedestrianRange + 260) {
        this.placeOnNearbyRoad(person, playerPosition, this.random() * 1000);
        if (!person.group.visible) person.placementRetryIn = 1.5;
      }
    }
    this.rebuildSpatialIndex();
  }

  applyVehicleImpact(person, vehicle) {
    if (!vehicle || !vehicle.group.visible || vehicle.parked || vehicle.stored ||
        vehicle.type === "boat" || person.impactCooldown > 0 || person.knockback) {
      return false;
    }

    const impactSpeed = Math.abs(vehicle.speed ?? 0);
    if (impactSpeed < 3.5) return false;

    const dx = person.group.position.x - vehicle.group.position.x;
    const dz = person.group.position.z - vehicle.group.position.z;
    const distance = Math.hypot(dx, dz);
    const isBike = ["bike", "motorcycle", "scooter", "bicycle"].includes(vehicle.type);
    const collisionRadius = vehicle.type === "bus" ? 4.8 :
      ["truck", "pickup"].includes(vehicle.type) ? 3.8 : isBike ? 1.8 : 2.7;
    if (distance > collisionRadius) return false;

    const travelDirection = Math.sign(vehicle.speed) || 1;
    const travelX = Math.sin(vehicle.group.rotation.y) * travelDirection;
    const travelZ = Math.cos(vehicle.group.rotation.y) * travelDirection;
    if (distance > 1.35 && dx * travelX + dz * travelZ < -0.35) return false;

    let directionX = distance > 0.001 ? dx / distance : travelX;
    let directionZ = distance > 0.001 ? dz / distance : travelZ;
    directionX += travelX * 0.35;
    directionZ += travelZ * 0.35;
    const directionLength = Math.hypot(directionX, directionZ) || 1;
    directionX /= directionLength;
    directionZ /= directionLength;

    const launchSpeed = Math.min(34, 2.5 + impactSpeed * 0.48);
    const launchHeight = Math.min(12, 2.2 + impactSpeed * 0.16);
    person.knockback = {
      velocityX: directionX * launchSpeed,
      velocityY: launchHeight,
      velocityZ: directionZ * launchSpeed,
      direction: Math.atan2(directionX, directionZ),
      elapsed: 0,
      landed: false,
      recoveryDelay: 1.2
    };
    person.impactCooldown = 1.5;
    person.alertTimer = 0;
    person.speed = 0;
    person.group.rotation.y = person.knockback.direction;
    return true;
  }

  updateKnockback(person, deltaSeconds) {
    const flight = person.knockback;
    flight.elapsed += deltaSeconds;

    if (!flight.landed) {
      flight.velocityY -= 18 * deltaSeconds;
      person.group.position.x += flight.velocityX * deltaSeconds;
      person.group.position.y += flight.velocityY * deltaSeconds;
      person.group.position.z += flight.velocityZ * deltaSeconds;
      flight.velocityX *= Math.exp(-2.2 * deltaSeconds);
      flight.velocityZ *= Math.exp(-2.2 * deltaSeconds);
      person.group.rotation.x = Math.min(1.35, flight.elapsed * 3.2);
      const limbs = person.group.userData.limbs;
      const flail = Math.sin(flight.elapsed * 18) * 0.32;
      limbs.leftArm.rotation.x = -1.2 + flail;
      limbs.rightArm.rotation.x = -1.2 - flail;
      limbs.leftLeg.rotation.x = 0.65 - flail * 0.6;
      limbs.rightLeg.rotation.x = -0.65 + flail * 0.6;

      if (person.group.position.y <= CONFIG.sidewalkHeight && flight.elapsed > 0.08) {
        person.group.position.y = CONFIG.sidewalkHeight;
        flight.velocityY = 0;
        flight.velocityX = 0;
        flight.velocityZ = 0;
        flight.landed = true;
        person.group.rotation.x = 1.35;
        limbs.leftArm.rotation.x = -1.35;
        limbs.rightArm.rotation.x = -1.35;
        limbs.leftLeg.rotation.x = 0.5;
        limbs.rightLeg.rotation.x = -0.5;
      }
      return;
    }

    person.group.position.y = CONFIG.sidewalkHeight;
    flight.recoveryDelay -= deltaSeconds;
    if (flight.recoveryDelay > 0) return;

    const getUpProgress = Math.min(1, -flight.recoveryDelay / 0.55);
    person.group.rotation.x = 1.35 * (1 - getUpProgress);
    if (getUpProgress >= 1) {
      person.group.rotation.set(0, flight.direction, 0);
      person.knockback = null;
      this.rejoinNearestRoad(person);
    }
  }

  rejoinNearestRoad(person) {
    const position = person.group.position;
    const edges = collectNearbyEdges(this.roads, position, 72);
    let nearest = null;
    let nearestProgress = 0;
    let nearestX = 0;
    let nearestZ = 0;
    let nearestDistanceSquared = Infinity;

    for (const edge of edges) {
      const dx = edge.endX - edge.startX;
      const dz = edge.endZ - edge.startZ;
      const lengthSquared = dx * dx + dz * dz;
      const progress = Math.max(0, Math.min(1,
        ((position.x - edge.startX) * dx + (position.z - edge.startZ) * dz) / lengthSquared
      ));
      const x = edge.startX + dx * progress;
      const z = edge.startZ + dz * progress;
      const distanceSquared = (position.x - x) ** 2 + (position.z - z) ** 2;
      if (distanceSquared < nearestDistanceSquared) {
        nearest = edge;
        nearestProgress = progress;
        nearestX = x;
        nearestZ = z;
        nearestDistanceSquared = distanceSquared;
      }
    }

    if (!nearest) {
      person.group.visible = false;
      person.placementRetryIn = 0;
      return;
    }

    const dx = nearest.endX - nearest.startX;
    const dz = nearest.endZ - nearest.startZ;
    const side = (position.x - nearestX) * dz + (position.z - nearestZ) * dx;
    person.fromX = nearest.gridX;
    person.fromZ = nearest.gridZ;
    person.toX = nearest.gridX + (nearest.axis === "horizontal" ? 1 : 0);
    person.toZ = nearest.gridZ + (nearest.axis === "vertical" ? 1 : 0);
    person.edge = nearest;
    person.progress = nearestProgress;
    person.side = side >= 0 ? 1 : -1;
    person.speed = 0;
    person.alertTimer = 0.8;
    this.setDestination(person, person.fromX, person.fromZ);
    this.positionPerson(person);
  }

  rebuildSpatialIndex() {
    this.spatialIndex.clear();
    for (const person of this.people) {
      if (person.group.visible) {
        this.spatialIndex.insert(person, person.group.position.x, person.group.position.z);
      }
    }
  }

  advanceRoute(person) {
    const nodeX = person.toX;
    const nodeZ = person.toZ;
    const previousX = person.fromX;
    const previousZ = person.fromZ;
    let candidates = this.roads.getNeighbors(nodeX, nodeZ).filter((neighbor) =>
      neighbor.nextX !== previousX || neighbor.nextZ !== previousZ
    );
    if (Math.abs(nodeX - person.destinationX) + Math.abs(nodeZ - person.destinationZ) < 1) {
      this.setDestination(person, nodeX, nodeZ);
    }
    if (candidates.length > 1) {
      const score = (candidate) => Math.abs(candidate.nextX - person.destinationX) +
        Math.abs(candidate.nextZ - person.destinationZ);
      const best = Math.min(...candidates.map(score));
      const toward = candidates.filter((candidate) => score(candidate) <= best + 1);
      if (toward.length) candidates = toward;
    }
    const route = candidates.length > 0
      ? candidates[Math.floor(this.random() * candidates.length)]
      : this.roads.getNeighbors(nodeX, nodeZ)[0];

    person.fromX = nodeX;
    person.fromZ = nodeZ;

    if (!route) {
      person.toX = previousX;
      person.toZ = previousZ;
      person.edge = this.roads.getEdgeBetween(nodeX, nodeZ, previousX, previousZ);
    } else {
      person.toX = route.nextX;
      person.toZ = route.nextZ;
      person.edge = route.edge;
    }

    person.side = this.random() > 0.5 ? 1 : -1;
  }

  positionPerson(person, deltaSeconds = 0) {
    const dx = person.toX - person.fromX;
    const dz = person.toZ - person.fromZ;
    const rightX = dz;
    const rightZ = dx;
    const sidewalkOffset = (person.edge?.width ?? CONFIG.roadWidths[0]) * 0.5 +
      CONFIG.sidewalkWidth * 0.5 - 0.65;

    person.group.position.set(
      person.fromX * CONFIG.blockSize +
        dx * CONFIG.blockSize * person.progress +
        rightX * sidewalkOffset * person.side,
      CONFIG.sidewalkHeight,
      person.fromZ * CONFIG.blockSize +
        dz * CONFIG.blockSize * person.progress +
        rightZ * sidewalkOffset * person.side
    );
    person.group.rotation.y = Math.atan2(dx, dz);
    person.phase += deltaSeconds * 8.4;
    person.group.userData.animateWalk(person.phase, person.speed > 0.12 ? 1 : 0);
    if (person.alertTimer > 0) {
      const limbs = person.group.userData.limbs;
      limbs.leftArm.rotation.x = -0.9;
      limbs.rightArm.rotation.x = -0.9;
    }
  }

  placeOnNearbyRoad(person, position, salt) {
    const edges = collectNearbyEdges(this.roads, position, CONFIG.pedestrianRange);

    if (edges.length === 0) {
      person.group.visible = false;
      return;
    }

    person.group.visible = true;
    const index = Math.abs(Math.floor(salt + this.random() * edges.length)) % edges.length;
    const edge = edges[index];
    const reverse = this.random() > 0.5;
    person.fromX = reverse ? edge.gridX + (edge.axis === "horizontal" ? 1 : 0) : edge.gridX;
    person.fromZ = reverse ? edge.gridZ + (edge.axis === "vertical" ? 1 : 0) : edge.gridZ;
    person.toX = reverse ? edge.gridX : edge.gridX + (edge.axis === "horizontal" ? 1 : 0);
    person.toZ = reverse ? edge.gridZ : edge.gridZ + (edge.axis === "vertical" ? 1 : 0);
    person.edge = edge;
    person.progress = this.random();
    person.side = this.random() > 0.5 ? 1 : -1;
    person.phase = this.random() * Math.PI * 2;
    this.setDestination(person, person.fromX, person.fromZ);
    this.positionPerson(person);
  }

  setDestination(person, startX, startZ) {
    person.destinationX = startX + Math.floor(this.random() * 9) - 4;
    person.destinationZ = startZ + Math.floor(this.random() * 9) - 4;
  }

  hasPeopleNear(x, z, radius) {
    let nearby = false;
    this.spatialIndex.forEachNear(x, z, radius, () => { nearby = true; });
    return nearby;
  }

  get count() {
    let visibleCount = 0;
    for (const person of this.people) {
      if (person.group.visible) visibleCount += 1;
    }
    return visibleCount;
  }

  setWorldVisible(visible) {
    for (const person of this.people) {
      if (!visible) {
        if (person.visibleBeforeInterior === undefined) {
          person.visibleBeforeInterior = person.group.visible;
        }
        person.group.visible = false;
      } else if (person.visibleBeforeInterior !== undefined) {
        person.group.visible = person.visibleBeforeInterior;
        delete person.visibleBeforeInterior;
      }
    }
    this.rebuildSpatialIndex();
  }
}

function collectNearbyEdges(roads, position, range) {
  const centerX = Math.floor(position.x / CONFIG.blockSize);
  const centerZ = Math.floor(position.z / CONFIG.blockSize);
  const spread = Math.ceil(range / CONFIG.blockSize) + 1;
  const edges = [];

  for (let gridZ = centerZ - spread; gridZ <= centerZ + spread; gridZ += 1) {
    for (let gridX = centerX - spread; gridX <= centerX + spread; gridX += 1) {
      const horizontal = roads.getEdge("horizontal", gridX, gridZ);
      const vertical = roads.getEdge("vertical", gridX, gridZ);

      if (horizontal && isNearby(position, horizontal.centerX, horizontal.centerZ, range)) {
        edges.push(horizontal);
      }

      if (vertical && isNearby(position, vertical.centerX, vertical.centerZ, range)) {
        edges.push(vertical);
      }
    }
  }

  return edges;
}

function isNearby(position, x, z, range) {
  const dx = position.x - x;
  const dz = position.z - z;
  return dx * dx + dz * dz < range * range;
}
