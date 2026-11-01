import * as THREE from "three";
import { CONFIG } from "../config.js";
import { seededRandom } from "../core/random.js";
import { SpatialGrid } from "../core/spatial-grid.js";
import { createTrafficVehicleModel, createVehicleModel } from "../models/vehicle-models.js";

const SUPPORT_TRAFFIC_COUNT = 8;
const VEHICLES_PER_CLASS = Math.max(12, Math.floor((CONFIG.trafficCount - SUPPORT_TRAFFIC_COUNT) / 3));
const TRAFFIC_CLASSES = [
  { name: "car", count: VEHICLES_PER_CLASS, minimum: 12, types: ["car", "compact", "sedan", "taxi", "sports"] },
  { name: "bike", count: VEHICLES_PER_CLASS, minimum: 10, types: ["motorcycle", "bike", "scooter", "bicycle"] },
  { name: "truck", count: VEHICLES_PER_CLASS, minimum: 10, types: ["truck"] },
  { name: "support", count: SUPPORT_TRAFFIC_COUNT, minimum: 4, types: ["van", "delivery", "service", "bus", "police", "ambulance", "fire", "pickup"] }
];
const BUS_ROUTE = [[-4, 0], [0, 0], [4, 0], [5, 0], [5, 4], [0, 4], [-4, 4], [-5, 4], [-5, 0]];
const CRUISE_SPEED = Object.freeze({
  car: 12.5, compact: 12, sedan: 12.5, taxi: 13, sports: 17, pickup: 10, truck: 9,
  van: 10, delivery: 9, service: 9, motorcycle: 16, scooter: 11, bike: 8,
  bicycle: 5, bus: 7.5, police: 15, ambulance: 14, fire: 8
});

export class TrafficSystem {
  constructor(scene, seed, catalog, roads, player) {
    this.scene = scene;
    this.seed = seed;
    this.catalog = catalog;
    this.roads = roads;
    this.player = player;
    this.vehicles = [];
    this.storedVehicles = [];
    this.spatialIndex = new SpatialGrid(48);
    this.random = seededRandom(seed, 44, 19, 0x2f175f41);
    this.flowClock = 0;
    this.incidentClock = 24;
    this.incident = null;
    this.activeClassCounts = Object.fromEntries(TRAFFIC_CLASSES.map(({ name, count }) => [name, count]));
    this.createInitialTraffic();
    this.createParkedTraffic();
    this.createStarterVehicle();
    this.rebuildSpatialIndex();
  }

  createInitialTraffic() {
    let trafficIndex = 0;
    for (const trafficClass of TRAFFIC_CLASSES) {
      for (let classIndex = 0; classIndex < trafficClass.count; classIndex += 1) {
        const type = trafficClass.types[Math.floor(this.random() * trafficClass.types.length)];
        const model = createTrafficVehicleModel(
          type,
          this.catalog,
          Math.floor(this.random() * this.catalog.materials.vehicles.length)
        );
        const vehicle = {
          group: model,
          type,
          trafficClass: trafficClass.name,
          classIndex,
          speed: 0,
          cruiseSpeed: (CRUISE_SPEED[type] ?? 11) * (0.86 + this.random() * 0.28),
          lane: 0,
          progress: 0,
          fromX: 0,
          fromZ: 0,
          toX: 0,
          toZ: 0,
          edge: null,
          trafficIndex,
          condition: 100,
          busRouteIndex: 0,
          busDwell: 0
        };

        this.scene.add(model);
        this.vehicles.push(vehicle);
        this.placeOnNearbyRoad(vehicle, this.player.position, trafficIndex * 23.7);
        trafficIndex += 1;
      }
    }
  }

  createParkedTraffic() {
    const parkedTypes = ["compact", "sedan", "taxi", "pickup", "van", "scooter", "bicycle"];
    for (let index = 0; index < parkedTypes.length; index += 1) {
      const type = parkedTypes[index];
      const vehicle = {
        group: createVehicleModel(type, this.catalog, index + 2), type, speed: 0,
        cruiseSpeed: CRUISE_SPEED[type] ?? 7, lane: 0, progress: 0,
        fromX: 0, fromZ: 0, toX: 0, toZ: 0, edge: null,
        parked: true, controlled: false, condition: 100
      };
      this.scene.add(vehicle.group);
      this.vehicles.push(vehicle);
      this.placeOnNearbyRoad(vehicle, this.player.position, 800 + index * 31.7);
      if (index < 5) {
        vehicle.group.position.set(464 + index * 28, CONFIG.roadHeight, -214);
        vehicle.group.rotation.y = 0;
      } else if (vehicle.edge) {
        const directionX = vehicle.toX - vehicle.fromX;
        const directionZ = vehicle.toZ - vehicle.fromZ;
        const curb = (vehicle.edge.width ?? CONFIG.roadWidths[0]) * 0.5 + 2.1;
        vehicle.group.position.x += directionZ * curb * (index % 2 ? 1 : -1);
        vehicle.group.position.y = CONFIG.roadHeight;
        vehicle.group.position.z -= directionX * curb * (index % 2 ? 1 : -1);
        vehicle.group.rotation.y = Math.atan2(directionX, directionZ);
      }
    }
  }

  update(deltaSeconds, playerPosition, timeOfDay = 0.5, pedestrians = null, district = "CITY") {
    this.roads.updateSignals(deltaSeconds);
    this.flowClock += deltaSeconds;
    this.incidentClock -= deltaSeconds;
    if (this.incidentClock <= 0) {
      this.startIncident(playerPosition);
      this.incidentClock = 78 + this.random() * 52;
    }
    if (this.incident) {
      this.incident.remaining -= deltaSeconds;
      if (this.incident.remaining <= 0) this.clearIncident();
    }

    const rush = Math.max(
      Math.exp(-Math.pow((timeOfDay - 0.31) / 0.07, 2)),
      Math.exp(-Math.pow((timeOfDay - 0.72) / 0.075, 2))
    );
    const localFlow = district === "CYPRESS PARK" || district === "AIRFIELD" ? 0.32 :
      district === "SUMMIT TRAIL" ? 0.22 : district === "SOUTH HARBOR" ? 0.82 : 1;
    const trafficFlow = (0.72 + rush * 0.28) * localFlow;
    for (const trafficClass of TRAFFIC_CLASSES) {
      const classRenderBudget = trafficClass.name === "car" ? 12 :
        trafficClass.name === "bike" ? 8 : trafficClass.name === "truck" ? 6 : 4;
      this.activeClassCounts[trafficClass.name] = Math.min(
        classRenderBudget,
        Math.max(trafficClass.minimum, Math.round(trafficClass.count * trafficFlow))
      );
    }

    for (const vehicle of this.vehicles) {
      if (vehicle.impactCooldown > 0) {
        vehicle.impactCooldown = Math.max(0, vehicle.impactCooldown - deltaSeconds);
      }
      if (vehicle.knockback) {
        vehicle.group.visible = true;
        continue;
      }
      if (vehicle.controlled || vehicle.parked || vehicle.stored || !vehicle.trafficClass) continue;
      if (vehicle.classIndex >= this.activeClassCounts[vehicle.trafficClass]) {
        vehicle.group.visible = false;
      } else if (!vehicle.group.visible) {
        vehicle.placementRetryIn = Math.max(0, (vehicle.placementRetryIn ?? 0) - deltaSeconds);
        if (vehicle.placementRetryIn <= 0) {
          this.placeOnNearbyRoad(vehicle, playerPosition, vehicle.trafficIndex * 43.3);
          if (!vehicle.group.visible) vehicle.placementRetryIn = 1.5;
        }
      }
    }

    const vehiclesByRoute = new Map();
    for (const vehicle of this.vehicles) {
      if (!vehicle.group.visible || vehicle.stored) continue;
      const key = trafficRouteKey(vehicle);
      // Collision checks below use the same start-of-frame snapshot for every
      // vehicle. This avoids earlier vehicles' updates changing the order or
      // route membership while later vehicles are being processed.
      vehicle.tickRouteKey = key;
      vehicle.tickProgress = vehicle.progress;
      vehicle.tickX = vehicle.group.position.x;
      vehicle.tickZ = vehicle.group.position.z;
      vehicle.tickVisible = vehicle.group.visible;
      vehicle.tickStored = vehicle.stored;
      let laneTraffic = vehiclesByRoute.get(key);
      if (!laneTraffic) {
        laneTraffic = [];
        vehiclesByRoute.set(key, laneTraffic);
      }
      laneTraffic.push(vehicle);
    }
    // Keep route traffic in progress order so a vehicle only needs to inspect
    // the few cars ahead of it on this block instead of every car sharing it.
    for (const laneTraffic of vehiclesByRoute.values()) {
      laneTraffic.sort((first, second) => first.tickProgress - second.tickProgress);
    }

    for (const vehicle of this.vehicles) {
      if (vehicle.controlled || vehicle.parked) {
        continue;
      }

      if (vehicle.stored || !vehicle.group.visible) continue;
      if (vehicle.knockback) {
        this.updateKnockback(vehicle, deltaSeconds);
        continue;
      }
      for (const lamp of vehicle.group.userData.emergencyLights ?? []) {
        lamp.material.emissiveIntensity = 0.35 + (Math.sin(this.flowClock * 12 + lamp.userData.flashPhase) + 1) * 0.72;
      }
      let desiredSpeed = vehicle.cruiseSpeed;
      if (vehicle.type === "bus" && vehicle.busDwell > 0) {
        vehicle.busDwell = Math.max(0, vehicle.busDwell - deltaSeconds);
        desiredSpeed = 0;
      }
      const remaining = CONFIG.blockSize * (1 - vehicle.progress);
      const signal = this.roads.signalColor(vehicle.toX, vehicle.toZ, vehicle.edge?.axis);
      if (remaining < 42 && signal !== "green") {
        desiredSpeed = signal === "amber" && remaining > 18 ? desiredSpeed * 0.35 : 0;
      }

      const laneTraffic = vehiclesByRoute.get(vehicle.tickRouteKey) ?? [];
      for (let index = firstVehicleAhead(laneTraffic, vehicle.tickProgress); index < laneTraffic.length; index += 1) {
        const other = laneTraffic[index];
        const gap = (other.tickProgress - vehicle.tickProgress) * CONFIG.blockSize;
        if (gap >= 34) break;
        if (gap <= 0 || !other.tickVisible || other.tickStored) continue;
        const lateralGap = Math.hypot(
          other.tickX - vehicle.tickX,
          other.tickZ - vehicle.tickZ
        );
        const sideGap = Math.sqrt(Math.max(0, lateralGap * lateralGap - gap * gap));
        if (sideGap > 8) continue;
        // The first in-lane vehicle is the tightest constraint; later cars
        // cannot require a lower speed because their gap is larger.
        desiredSpeed = Math.min(desiredSpeed, Math.max(0, (gap - 7) * 0.62));
        break;
      }

      if (this.incident && vehicle.edge === this.incident.edge) {
        const gap = Math.abs(vehicle.progress - this.incident.progress) * CONFIG.blockSize;
        if (gap < 62) desiredSpeed = Math.min(desiredSpeed, Math.max(0, (gap - 15) * 0.3));
      }

      if (remaining < 45) {
        const crossingX = vehicle.group.position.x + (vehicle.toX - vehicle.fromX) * 10;
        const crossingZ = vehicle.group.position.z + (vehicle.toZ - vehicle.fromZ) * 10;
        const playerAtCrossing = !this.player.activeVehicle &&
          distanceSquared(playerPosition.x, playerPosition.z, crossingX, crossingZ) < 9 * 9;
        if (playerAtCrossing || pedestrians?.hasPeopleNear(crossingX, crossingZ, 7)) desiredSpeed = 0;
      }

      const accelerating = desiredSpeed > vehicle.speed;
      vehicle.speed = approach(vehicle.speed, desiredSpeed, (accelerating ? 4.2 : 16) * deltaSeconds);

      vehicle.progress += vehicle.speed * deltaSeconds / CONFIG.blockSize;

      while (vehicle.progress >= 1) {
        vehicle.progress -= 1;
        this.advanceRoute(vehicle);
      }

      this.positionVehicle(vehicle);

      const distance = Math.hypot(
        vehicle.group.position.x - playerPosition.x,
        vehicle.group.position.z - playerPosition.z
      );

      if (distance > CONFIG.trafficRange + 350) {
        this.placeOnNearbyRoad(vehicle, playerPosition, this.random() * 1000);
      }
    }
    this.rebuildSpatialIndex();
  }

  rebuildSpatialIndex() {
    this.spatialIndex.clear();
    for (const vehicle of this.vehicles) {
      if (vehicle.group.visible && !vehicle.stored) {
        this.spatialIndex.insert(vehicle, vehicle.group.position.x, vehicle.group.position.z);
      }
    }
  }

  forEachVehicleNear(x, z, radius, visit) {
    this.spatialIndex.forEachNear(x, z, radius, visit);
  }

  bumpVehicle(vehicle, directionX, directionZ, impactSpeed = 0) {
    if (!vehicle || vehicle.stored || vehicle.controlled || vehicle.knockback ||
        (vehicle.impactCooldown ?? 0) > 0) return false;

    let length = Math.hypot(directionX, directionZ);
    if (length < 0.001) {
      directionX = Math.sin(vehicle.group.rotation.y);
      directionZ = Math.cos(vehicle.group.rotation.y);
      length = 1;
    }
    directionX /= length;
    directionZ /= length;
    const wasParked = vehicle.parked === true;
    vehicle.parked = false;
    vehicle.group.visible = true;
    vehicle.condition = Math.max(0, (vehicle.condition ?? 100) - Math.min(32, impactSpeed * 0.38));
    vehicle.group.userData.setCondition?.(vehicle.condition);
    vehicle.speed = 0;
    vehicle.impactCooldown = 1.1;
    vehicle.knockback = {
      wasParked,
      anchorX: vehicle.group.position.x,
      anchorY: vehicle.group.position.y,
      anchorZ: vehicle.group.position.z,
      offsetX: 0,
      offsetY: 0,
      offsetZ: 0,
      velocityX: directionX * Math.min(10, 3 + impactSpeed * 0.04),
      velocityY: Math.min(4.8, 2.8 + impactSpeed * 0.018),
      velocityZ: directionZ * Math.min(10, 3 + impactSpeed * 0.04),
      elapsed: 0,
      roll: directionX * 0.14
    };
    return true;
  }

  updateKnockback(vehicle, deltaSeconds) {
    const flight = vehicle.knockback;
    flight.elapsed += deltaSeconds;
    flight.velocityY -= 12 * deltaSeconds;
    flight.offsetX += flight.velocityX * deltaSeconds;
    flight.offsetY += flight.velocityY * deltaSeconds;
    flight.offsetZ += flight.velocityZ * deltaSeconds;
    flight.velocityX *= Math.exp(-2.4 * deltaSeconds);
    flight.velocityZ *= Math.exp(-2.4 * deltaSeconds);

    if (flight.offsetY <= 0 && flight.elapsed > 0.08) {
      vehicle.group.position.set(
        flight.anchorX + flight.offsetX,
        flight.anchorY,
        flight.anchorZ + flight.offsetZ
      );
      vehicle.group.rotation.z = 0;
      vehicle.knockback = null;
      vehicle.parked = flight.wasParked;
      vehicle.speed = 0;
      return;
    }

    vehicle.group.position.set(
      flight.anchorX + flight.offsetX,
      flight.anchorY + Math.max(0, flight.offsetY),
      flight.anchorZ + flight.offsetZ
    );
    vehicle.group.rotation.z = Math.sin(flight.elapsed * 15) * flight.roll;
  }

  startIncident(position) {
    if (this.incident) return;
    const edges = this.collectNearbyEdges(position, CONFIG.trafficRange * 0.8);
    if (!edges.length) return;
    const edge = edges[Math.floor(this.random() * edges.length)];
    const group = new THREE.Group();
    const wreck = createVehicleModel("sedan", this.catalog, 7);
    wreck.scale.setScalar(0.88);
    group.add(wreck);
    const progress = 0.35 + this.random() * 0.3;
    const x = edge.startX + (edge.endX - edge.startX) * progress;
    const z = edge.startZ + (edge.endZ - edge.startZ) * progress;
    wreck.position.set(x, 0, z);
    wreck.rotation.y = edge.axis === "horizontal" ? (this.random() > 0.5 ? Math.PI * 0.5 : -Math.PI * 0.5) : 0.22;
    const coneMaterial = this.catalog.materials.terracotta;
    for (const side of [-1, 1]) {
      const cone = new THREE.Mesh(this.catalog.geometries.cone, coneMaterial);
      cone.position.set(x + side * 4.5, 0.5, z + 3.5);
      cone.scale.set(0.4, 1, 0.4);
      group.add(cone);
    }
    this.scene.add(group);
    this.incident = { group, edge, progress, remaining: 42 };
  }

  clearIncident() {
    if (!this.incident) return;
    this.scene.remove(this.incident.group);
    this.incident = null;
  }

  createGarageVehicle(kind, position, colorIndex = 3) {
    const group = createVehicleModel(kind, this.catalog, colorIndex);
    group.position.set(position.x, 0, position.z);
    this.scene.add(group);
    const vehicle = {
      group, type: kind, speed: 0, cruiseSpeed: CRUISE_SPEED[kind] ?? 12,
      lane: 0, progress: 0, fromX: 0, fromZ: 0, toX: 0, toZ: 0,
      edge: null, parked: true, controlled: false, condition: 100, stored: false
    };
    this.vehicles.push(vehicle);
    this.rebuildSpatialIndex();
    return vehicle;
  }

  storeVehicle(vehicle) {
    if (!vehicle || Math.abs(vehicle.speed) > 2.5) return false;
    vehicle.controlled = false;
    vehicle.parked = false;
    vehicle.stored = true;
    vehicle.group.visible = false;
    if (!this.storedVehicles.includes(vehicle)) this.storedVehicles.push(vehicle);
    this.rebuildSpatialIndex();
    return true;
  }

  releaseStoredVehicle(vehicle, position) {
    if (!vehicle || !this.storedVehicles.includes(vehicle)) return false;
    this.storedVehicles = this.storedVehicles.filter((stored) => stored !== vehicle);
    vehicle.stored = false;
    vehicle.parked = true;
    vehicle.speed = 0;
    vehicle.group.position.set(position.x, 0, position.z);
    vehicle.group.rotation.y = 0;
    vehicle.group.visible = true;
    this.rebuildSpatialIndex();
    return true;
  }

  createStarterVehicle() {
    const model = createVehicleModel("car", this.catalog, 2);
    const vehicle = {
      group: model,
      type: "car",
      speed: 0,
      cruiseSpeed: CRUISE_SPEED.sedan,
      lane: 0,
      progress: 0,
      fromX: 0,
      fromZ: 0,
      toX: 0,
      toZ: 0,
      edge: null,
      parked: true,
      controlled: false,
      condition: 100
    };

    model.position.set(
      this.player.position.x + 3.8,
      CONFIG.roadHeight,
      this.player.position.z - 5
    );
    model.rotation.y = 0;
    for (const light of model.userData.headlights ?? []) light.visible = true;
    this.scene.add(model);
    this.vehicles.push(vehicle);
  }

  findNearestAvailable(position, maximumDistance = CONFIG.vehicleInteractDistance) {
    const maximumDistanceSquared = maximumDistance * maximumDistance;
    let nearest = null;
    let nearestDistanceSquared = maximumDistanceSquared;

    this.forEachVehicleNear(position.x, position.z, maximumDistance, (vehicle, squaredDistance) => {
      if (vehicle.controlled || vehicle.stored) return;
      if (squaredDistance < nearestDistanceSquared) {
        nearest = vehicle;
        nearestDistanceSquared = squaredDistance;
      }
    });

    return nearest;
  }

  findVehicleNear(position, radius) {
    let nearest = null;
    let nearestDistance = radius * radius;
    this.forEachVehicleNear(position.x, position.z, radius, (vehicle, distance) => {
      if (vehicle.controlled || vehicle.parked) return;
      if (distance < nearestDistance) {
        nearest = vehicle;
        nearestDistance = distance;
      }
    });
    return nearest;
  }

  advanceRoute(vehicle) {
    const nodeX = vehicle.toX;
    const nodeZ = vehicle.toZ;
    const previousX = vehicle.fromX;
    const previousZ = vehicle.fromZ;
    const candidates = this.roads.getNeighbors(nodeX, nodeZ).filter((neighbor) =>
      neighbor.nextX !== vehicle.fromX || neighbor.nextZ !== vehicle.fromZ
    );
    let route = candidates.length > 0
      ? candidates[Math.floor(this.random() * candidates.length)]
      : this.roads.getNeighbors(nodeX, nodeZ)[0];

    if (vehicle.type === "bus" && candidates.length) {
      const stop = BUS_ROUTE[vehicle.busRouteIndex % BUS_ROUTE.length];
      if (nodeX === stop[0] && nodeZ === stop[1]) {
        vehicle.busRouteIndex = (vehicle.busRouteIndex + 1) % BUS_ROUTE.length;
        vehicle.busDwell = 1.8;
      }
      const nextStop = BUS_ROUTE[vehicle.busRouteIndex % BUS_ROUTE.length];
      const distance = (candidate) => Math.abs(candidate.nextX - nextStop[0]) + Math.abs(candidate.nextZ - nextStop[1]);
      const best = Math.min(...candidates.map(distance));
      const routeCandidates = candidates.filter((candidate) => distance(candidate) <= best);
      if (routeCandidates.length) route = routeCandidates[0];
    }

    if (!route) {
      vehicle.fromX = nodeX;
      vehicle.fromZ = nodeZ;
      vehicle.toX = previousX;
      vehicle.toZ = previousZ;
      vehicle.edge = this.roads.getEdgeBetween(nodeX, nodeZ, previousX, previousZ);
      vehicle.lane = (vehicle.edge?.width ?? CONFIG.roadWidths[0]) * 0.16;
      return;
    }

    vehicle.fromX = nodeX;
    vehicle.fromZ = nodeZ;
    vehicle.toX = route.nextX;
    vehicle.toZ = route.nextZ;
    vehicle.edge = route.edge;
    vehicle.lane = (route.edge?.width ?? CONFIG.roadWidths[0]) * 0.16;
  }

  positionVehicle(vehicle) {
    const dx = vehicle.toX - vehicle.fromX;
    const dz = vehicle.toZ - vehicle.fromZ;
    const fromWorldX = vehicle.fromX * CONFIG.blockSize;
    const fromWorldZ = vehicle.fromZ * CONFIG.blockSize;
    const rightX = dz;
    const rightZ = dx;
    const progress = vehicle.progress;

    vehicle.group.position.set(
      fromWorldX + dx * CONFIG.blockSize * progress + rightX * vehicle.lane,
      CONFIG.roadHeight,
      fromWorldZ + dz * CONFIG.blockSize * progress + rightZ * vehicle.lane
    );
    vehicle.group.rotation.y = Math.atan2(dx, dz);
  }

  placeOnNearbyRoad(vehicle, position, salt) {
    const edges = this.collectNearbyEdges(position, CONFIG.trafficRange);

    if (edges.length === 0) {
      vehicle.group.visible = false;
      vehicle.placementRetryIn = 1.5;
      return;
    }

    vehicle.group.visible = true;
    const edgeIndex = Math.abs(Math.floor(salt + this.random() * edges.length)) % edges.length;
    const edge = edges[edgeIndex];
    const reverse = this.random() > 0.5;
    vehicle.fromX = reverse ? edge.gridX + (edge.axis === "horizontal" ? 1 : 0) : edge.gridX;
    vehicle.fromZ = reverse ? edge.gridZ + (edge.axis === "vertical" ? 1 : 0) : edge.gridZ;
    vehicle.toX = reverse ? edge.gridX : edge.gridX + (edge.axis === "horizontal" ? 1 : 0);
    vehicle.toZ = reverse ? edge.gridZ : edge.gridZ + (edge.axis === "vertical" ? 1 : 0);
    vehicle.edge = edge;
    vehicle.progress = this.random();
    vehicle.lane = edge.width * 0.16;
    this.positionVehicle(vehicle);
  }

  collectNearbyEdges(position, range) {
    const centerX = Math.floor(position.x / CONFIG.blockSize);
    const centerZ = Math.floor(position.z / CONFIG.blockSize);
    const spread = Math.ceil(range / CONFIG.blockSize) + 1;
    const edges = [];

    for (let gridZ = centerZ - spread; gridZ <= centerZ + spread; gridZ += 1) {
      for (let gridX = centerX - spread; gridX <= centerX + spread; gridX += 1) {
        const horizontal = this.roads.getEdge("horizontal", gridX, gridZ);
        const vertical = this.roads.getEdge("vertical", gridX, gridZ);

        if (horizontal && distanceSquared(position.x, position.z, horizontal.centerX, horizontal.centerZ) < range * range) {
          edges.push(horizontal);
        }

        if (vertical && distanceSquared(position.x, position.z, vertical.centerX, vertical.centerZ) < range * range) {
          edges.push(vertical);
        }
      }
    }

    return edges;
  }

  get count() {
    let visibleCount = 0;
    for (const vehicle of this.vehicles) {
      if (vehicle.group.visible) visibleCount += 1;
    }
    return visibleCount;
  }

  setWorldVisible(visible) {
    for (const vehicle of this.vehicles) {
      if (!visible) {
        if (vehicle.visibleBeforeInterior === undefined) {
          vehicle.visibleBeforeInterior = vehicle.group.visible;
        }
        vehicle.group.visible = false;
      } else if (vehicle.visibleBeforeInterior !== undefined) {
        vehicle.group.visible = vehicle.visibleBeforeInterior;
        delete vehicle.visibleBeforeInterior;
      }
    }
    this.rebuildSpatialIndex();
  }
}

function approach(value, target, amount) {
  return value < target ? Math.min(value + amount, target) : Math.max(value - amount, target);
}

function distanceSquared(x1, z1, x2, z2) {
  const dx = x1 - x2;
  const dz = z1 - z2;
  return dx * dx + dz * dz;
}

function trafficRouteKey(vehicle) {
  return vehicle.fromX + ":" + vehicle.fromZ + ":" + vehicle.toX + ":" + vehicle.toZ;
}

function firstVehicleAhead(laneTraffic, progress) {
  let low = 0;
  let high = laneTraffic.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (laneTraffic[middle].tickProgress <= progress) low = middle + 1;
    else high = middle;
  }
  return low;
}

