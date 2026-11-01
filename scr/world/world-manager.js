import * as THREE from "three";
import { CONFIG } from "../config.js";
import { seededRandom } from "../core/random.js";
import { addCylinder } from "../models/catalog.js";
import { createBuilding } from "../models/building-model.js";
import { coastlineAt } from "./road-network.js";

export class WorldManager {
  constructor(scene, seed, catalog, roads) {
    this.scene = scene;
    this.seed = seed;
    this.catalog = catalog;
    this.roads = roads;
    this.sharedGeometries = new Set(Object.values(catalog.geometries));
    this.sharedMaterials = new Set(
      Object.values(catalog.materials).flatMap((material) =>
        Array.isArray(material) ? material : [material]
      )
    );
    this.chunks = new Map();
    this.chunkRadius = CONFIG.chunkRadius;
    this.colliders = [];
    this.collidersDirty = true;
    this.lastCenterX = null;
    this.lastCenterZ = null;
    this.activeInterior = null;
    this.interiorExteriorPosition = null;
    this.interiorGroup = null;
    this.environmentTime = 0;
    this.summitGroup = new THREE.Group();
    const summit = new THREE.Mesh(
      catalog.geometries.mountain,
      catalog.materials.mountain[1]
    );
    summit.position.set(-520, 110, -2100);
    summit.scale.set(800, 220, 800);
    summit.castShadow = true;
    summit.receiveShadow = true;
    this.summitGroup.add(summit);
    const lookoutDeck = new THREE.Mesh(catalog.geometries.box, catalog.materials.dock);
    lookoutDeck.position.set(-520, 173.3, -1930);
    lookoutDeck.scale.set(30, 0.45, 24);
    lookoutDeck.receiveShadow = true;
    this.summitGroup.add(lookoutDeck);
    const lookoutRail = new THREE.Mesh(catalog.geometries.box, catalog.materials.trim);
    lookoutRail.position.set(-520, 174.05, -1941);
    lookoutRail.scale.set(28, 1.05, 0.3);
    this.summitGroup.add(lookoutRail);
    const bench = new THREE.Mesh(catalog.geometries.box, catalog.materials.dock);
    bench.position.set(-532, 173.92, -1927);
    bench.scale.set(4.4, 0.2, 0.85);
    this.summitGroup.add(bench);
    for (const side of [-1, 1]) {
      const benchLeg = new THREE.Mesh(catalog.geometries.box, catalog.materials.trim);
      benchLeg.position.set(-532 + side * 1.55, 173.67, -1927);
      benchLeg.scale.set(0.18, 0.55, 0.55);
      this.summitGroup.add(benchLeg);
    }
    const signPost = new THREE.Mesh(catalog.geometries.cylinder, catalog.materials.trim);
    signPost.position.set(-506, 174.6, -1923);
    signPost.scale.set(0.12, 2.2, 0.12);
    this.summitGroup.add(signPost);
    const lookoutSign = new THREE.Mesh(catalog.geometries.box, catalog.materials.roadSign);
    lookoutSign.position.set(-506, 175.8, -1923);
    lookoutSign.scale.set(3.2, 1.7, 0.18);
    this.summitGroup.add(lookoutSign);
    this.scene.add(this.summitGroup);
  }

  updateAround(position) {
    const centerX = Math.floor(position.x / CONFIG.blockSize);
    const centerZ = Math.floor(position.z / CONFIG.blockSize);

    if (centerX === this.lastCenterX && centerZ === this.lastCenterZ && this.chunks.size > 0) {
      return;
    }

    for (let offsetZ = -this.chunkRadius; offsetZ <= this.chunkRadius; offsetZ += 1) {
      for (let offsetX = -this.chunkRadius; offsetX <= this.chunkRadius; offsetX += 1) {
        this.ensureChunk(centerX + offsetX, centerZ + offsetZ);
      }
    }

    for (const [key, chunk] of this.chunks) {
      if (
        Math.abs(chunk.x - centerX) > this.chunkRadius ||
        Math.abs(chunk.z - centerZ) > this.chunkRadius
      ) {
        this.scene.remove(chunk.group);
        this.disposeChunkResources(chunk.group);
        this.chunks.delete(key);
        this.collidersDirty = true;
      }
    }

    this.roads.pruneCache(centerX, centerZ, this.chunkRadius + 2);
    this.lastCenterX = centerX;
    this.lastCenterZ = centerZ;
  }

  ensureChunk(cellX, cellZ) {
    const key = cellX + ":" + cellZ;

    if (this.chunks.has(key)) {
      return;
    }

    const group = new THREE.Group();
    const colliders = [];
    const centerX = (cellX + 0.5) * CONFIG.blockSize;
    const centerZ = (cellZ + 0.5) * CONFIG.blockSize;
    const random = seededRandom(this.seed, cellX, cellZ, 0x4f231c8d);

    this.addGround(group, cellX, cellZ);
    this.addCanal(group, cellX, cellZ);
    this.addMountains(group, cellX, cellZ, random);
    this.roads.addBlockRoads(group, cellX, cellZ);

    if (this.roads.isOnLand(centerX, centerZ - 42)) {
      const lotOffsets = [
        [-58, -73],
        [58, -73],
        [-58, 0],
        [58, 0],
        [-58, 73],
        [58, 73]
      ];

      for (let index = 0; index < lotOffsets.length; index += 1) {
        if (index > 2 && random() < 0.16) {
          continue;
        }

        const [offsetX, offsetZ] = lotOffsets[index];
        const x = centerX + offsetX + (random() - 0.5) * 8;
        const z = centerZ + offsetZ + (random() - 0.5) * 8;

        if (!this.roads.isOnLand(x, z + 35)) {
          continue;
        }

        if (this.isReservedLot(x, z)) continue;

        colliders.push(createBuilding(
          group,
          this.catalog,
          this.seed,
          cellX,
          cellZ,
          index,
          x,
          z,
          this.buildingDistrictAt(x, z)
        ));
      }
    }

    this.addPark(group, cellX, cellZ, random);
    this.addGarage(group, cellX, cellZ);
    this.addAirport(group, cellX, cellZ);
    this.addHarbor(group, cellX, cellZ);
    this.addStreetlights(group, cellX, cellZ);
    this.addCoastalPalms(group, cellX, cellZ, random);
    this.scene.add(group);
    this.chunks.set(key, { x: cellX, z: cellZ, group, colliders, windObjects: group.userData.windObjects ?? [], nightLights: group.userData.nightLights ?? [] });
    this.collidersDirty = true;
  }

  disposeChunkResources(group) {
    const ownedGeometries = new Set();
    const ownedMaterials = new Set();
    group.traverse((object) => {
      if (object.geometry && !this.sharedGeometries.has(object.geometry)) {
        ownedGeometries.add(object.geometry);
      }
      if (object.isInstancedMesh) object.dispose?.();

      const materials = Array.isArray(object.material)
        ? object.material
        : object.material ? [object.material] : [];
      for (const material of materials) {
        if (!this.sharedMaterials.has(material)) ownedMaterials.add(material);
      }
    });

    for (const geometry of ownedGeometries) geometry.dispose();
    for (const material of ownedMaterials) material.dispose();
  }

  addGround(group, cellX, cellZ) {
    const size = CONFIG.blockSize;
    const startX = cellX * size;
    const startZ = cellZ * size;
    const columns = 8;
    const positions = [];
    const indices = [];
    let hasLand = false;

    if (Math.abs(startX + size * 0.5) > CONFIG.cityHalfWidth) {
      return;
    }

    for (let column = 0; column <= columns; column += 1) {
      const x = startX + size * column / columns;
      const landEnd = Math.max(
        startZ,
        Math.min(startZ + size, coastlineAt(x) - 118)
      );
      hasLand ||= landEnd > startZ + 0.01;
      positions.push(x, -0.03, startZ);
      positions.push(x, -0.03, landEnd);

      if (column < columns) {
        const a = column * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }

    if (!hasLand) {
      return;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const ground = new THREE.Mesh(geometry, this.catalog.materials.land);
    ground.receiveShadow = true;
    group.add(ground);
  }

  addCanal(group, cellX, cellZ) {
    const size = CONFIG.blockSize;
    const chunkStartX = cellX * size;
    const chunkEndX = chunkStartX + size;
    const canalStartX = CONFIG.bridgeGridX * size - CONFIG.canalHalfLength;
    const canalEndX = CONFIG.bridgeGridX * size + CONFIG.canalHalfLength;
    const startX = Math.max(chunkStartX, canalStartX);
    const endX = Math.min(chunkEndX, canalEndX);
    const canalStartZ = CONFIG.canalCenterZ - CONFIG.canalWidth * 0.5;
    const canalEndZ = CONFIG.canalCenterZ + CONFIG.canalWidth * 0.5;
    const chunkStartZ = cellZ * size;
    const chunkEndZ = chunkStartZ + size;
    const startZ = Math.max(chunkStartZ, canalStartZ);
    const endZ = Math.min(chunkEndZ, canalEndZ);

    if (startX >= endX || startZ >= endZ) {
      return;
    }

    const water = new THREE.Mesh(this.catalog.geometries.box, this.catalog.materials.canal);
    water.position.set((startX + endX) * 0.5, 0.025, (startZ + endZ) * 0.5);
    water.scale.set(endX - startX, 0.06, endZ - startZ);
    water.receiveShadow = true;
    group.add(water);

    for (const side of [-1, 1]) {
      const bank = new THREE.Mesh(this.catalog.geometries.box, this.catalog.materials.bridge);
      bank.position.set(
        (startX + endX) * 0.5,
        0.2,
        CONFIG.canalCenterZ + side * (CONFIG.canalWidth * 0.5 + 0.25)
      );
      bank.scale.set(endX - startX, 0.48, 0.7);
      bank.receiveShadow = true;
      group.add(bank);
    }
  }

  addMountains(group, cellX, cellZ, random) {
    const centerZ = (cellZ + 0.5) * CONFIG.blockSize;

    if (centerZ > CONFIG.mountainStartZ) {
      return;
    }

    const summitX = -520;
    const summitZ = -2100;
    const count = 1 + Math.floor(random() * 2);
    const tunnelRow = cellZ === CONFIG.tunnelGridZ;

    for (let index = 0; index < count; index += 1) {
      const x = (cellX + 0.14 + random() * 0.72) * CONFIG.blockSize;
      const z = (cellZ + 0.14 + random() * 0.72) * CONFIG.blockSize;
      const inTunnelApproach = tunnelRow &&
        Math.abs(x) <= CONFIG.tunnelHalfLength + 150;
      const inSummitMass = Math.hypot(x - summitX, z - summitZ) < 980;

      if (inTunnelApproach || inSummitMass || this.isNearRoad(x, z, 92)) {
        continue;
      }

      const height = 145 + random() * 250;
      const radius = 110 + random() * 115;
      const peak = new THREE.Mesh(
        this.catalog.geometries.mountain,
        this.catalog.materials.mountain[Math.floor(random() * this.catalog.materials.mountain.length)]
      );
      peak.position.set(x, height * 0.5 - 0.05, z);
      peak.scale.set(radius, height, radius * (0.78 + random() * 0.4));
      peak.rotation.y = random() * Math.PI;
      peak.castShadow = true;
      peak.receiveShadow = true;
      group.add(peak);

      const trail = new THREE.Mesh(
        this.catalog.geometries.trail,
        this.catalog.materials.trail
      );
      trail.position.set(x, peak.position.y, z);
      trail.scale.set(radius, height, radius);
      trail.rotation.y = peak.rotation.y;
      trail.receiveShadow = true;
      group.add(trail);

      const foothill = new THREE.Mesh(
        this.catalog.geometries.mountain,
        this.catalog.materials.mountain[Math.floor(random() * this.catalog.materials.mountain.length)]
      );
      foothill.position.set(x + (random() - 0.5) * 135, 38, z + 48);
      foothill.scale.set(radius * 1.28, 76, radius * 1.12);
      foothill.rotation.y = peak.rotation.y + 0.5;
      foothill.castShadow = true;
      foothill.receiveShadow = true;
      group.add(foothill);
    }
  }

  addCoastalPalms(group, cellX, cellZ, random) {
    const centerX = (cellX + 0.5) * CONFIG.blockSize;
    const centerZ = (cellZ + 0.5) * CONFIG.blockSize;
    const coast = coastlineAt(centerX);

    if (centerZ < coast - 390 || centerZ > coast - 115) {
      return;
    }

    const palmCount = 1 + Math.floor(random() * 3);

    for (let index = 0; index < palmCount; index += 1) {
      const x = centerX + (random() - 0.5) * CONFIG.blockSize * 0.76;
      const z = centerZ + (random() - 0.5) * CONFIG.blockSize * 0.72;
      this.addPalm(group, x, z, 0.86 + random() * 0.52);
    }
  }

  isNearRoad(x, z, margin) {
    const size = CONFIG.blockSize;
    const cellX = Math.floor(x / size);
    const cellZ = Math.floor(z / size);

    for (let gridZ = cellZ - 1; gridZ <= cellZ + 1; gridZ += 1) {
      for (let gridX = cellX - 1; gridX <= cellX + 1; gridX += 1) {
        const horizontal = this.roads.getEdge("horizontal", gridX, gridZ);
        if (horizontal &&
            Math.abs(z - horizontal.centerZ) < horizontal.width * 0.5 + margin &&
            x >= horizontal.startX - margin && x <= horizontal.endX + margin) {
          return true;
        }

        const vertical = this.roads.getEdge("vertical", gridX, gridZ);
        if (vertical &&
            Math.abs(x - vertical.centerX) < vertical.width * 0.5 + margin &&
            z >= vertical.startZ - margin && z <= vertical.endZ + margin) {
          return true;
        }
      }
    }

    return false;
  }

  addPalm(group, x, z, scale) {
    const trunkHeight = 5.2 * scale;
    addCylinder(
      group,
      this.catalog,
      this.catalog.materials.bark,
      { x, y: trunkHeight * 0.5, z },
      { x: 0.34 * scale, y: trunkHeight, z: 0.34 * scale },
      true
    );

    const crown = new THREE.Group();
    crown.position.set(x, trunkHeight, z);
    crown.userData.windPhase = x * 0.004 + z * 0.002;
    group.userData.windObjects ??= [];
    group.userData.windObjects.push(crown);
    group.add(crown);

    for (let frond = 0; frond < 7; frond += 1) {
      const angle = frond * Math.PI * 2 / 7;
      const leaf = new THREE.Mesh(
        this.catalog.geometries.palmFrond,
        this.catalog.materials.palm
      );

      leaf.position.set(
        Math.cos(angle) * 1.55 * scale,
        -0.2 * scale,
        Math.sin(angle) * 1.55 * scale
      );
      leaf.rotation.set(-0.55, -angle, Math.PI * 0.5);
      leaf.scale.set(0.24 * scale, 2.25 * scale, 0.48 * scale);
      leaf.castShadow = true;
      leaf.receiveShadow = true;
      crown.add(leaf);
    }
  }

  isParkLot(x, z) {
    return x >= -1690 && x <= -910 && z >= 0 && z <= 760;
  }

  isAirportLot(x, z) {
    return Math.abs(x - 3900) < 590 && Math.abs(z + 1200) < 190;
  }

  isReservedLot(x, z) {
    return this.isParkLot(x, z) || this.isAirportLot(x, z) ||
      (Math.abs(x - 520) < 96 && Math.abs(z + 130) < 65) ||
      Math.hypot(x + 520, z + 2100) < 980 ||
      [3650, 4150].some((hangarX) => Math.abs(x - hangarX) < 110 && Math.abs(z + 1380) < 70);
  }

  addPark(group, cellX, cellZ, random) {
    const size = CONFIG.blockSize;
    const minX = cellX * size;
    const minZ = cellZ * size;
    const centerX = minX + size * 0.5;
    const centerZ = minZ + size * 0.5;
    if (!this.isParkLot(centerX, centerZ)) return;
    const lawn = new THREE.Mesh(this.catalog.geometries.box, this.catalog.materials.park);
    lawn.position.set(centerX, 0.015, centerZ);
    lawn.scale.set(size - 5, 0.04, size - 5);
    lawn.receiveShadow = true;
    group.add(lawn);
    const pathH = new THREE.Mesh(this.catalog.geometries.box, this.catalog.materials.parkPath);
    pathH.position.set(centerX, 0.06, centerZ);
    pathH.scale.set(size - 14, 0.08, 5.5);
    group.add(pathH);
    const pathV = new THREE.Mesh(this.catalog.geometries.box, this.catalog.materials.parkPath);
    pathV.position.set(centerX, 0.061, centerZ);
    pathV.scale.set(5.5, 0.08, size - 14);
    group.add(pathV);
    for (let index = 0; index < 3; index += 1) {
      const x = centerX + (random() - 0.5) * (size - 54);
      const z = centerZ + (random() - 0.5) * (size - 54);
      if (Math.abs(x - centerX) < 24 || Math.abs(z - centerZ) < 24) continue;
      this.addParkTree(group, x, z, 0.8 + random() * 0.45);
    }
    const bench = new THREE.Mesh(this.catalog.geometries.box, this.catalog.materials.dock);
    bench.position.set(centerX + 34, 0.58, centerZ + 30);
    bench.scale.set(3.6, 0.18, 0.85);
    group.add(bench);
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(this.catalog.geometries.box, this.catalog.materials.trim);
      leg.position.set(centerX + 34, 0.29, centerZ + 30 + side * 0.28);
      leg.scale.set(0.18, 0.58, 0.16);
      group.add(leg);
    }
  }

  addParkTree(group, x, z, scale) {
    const tree = new THREE.Group();
    tree.position.set(x, 0, z);
    tree.userData.windPhase = x * 0.006 + z * 0.003;
    group.userData.windObjects ??= [];
    group.userData.windObjects.push(tree);
    const trunk = new THREE.Mesh(this.catalog.geometries.cylinder, this.catalog.materials.bark);
    trunk.position.y = 2.4 * scale;
    trunk.scale.set(0.34 * scale, 4.8 * scale, 0.34 * scale);
    tree.add(trunk);
    const crown = new THREE.Mesh(this.catalog.geometries.sphere, this.catalog.materials.park);
    crown.position.y = 5.2 * scale;
    crown.scale.set(2.2 * scale, 2.5 * scale, 2.2 * scale);
    crown.castShadow = true;
    tree.add(crown);
    group.add(tree);
  }

  addGarage(group, cellX, cellZ) {
    if (cellX !== Math.floor(520 / CONFIG.blockSize) || cellZ !== Math.floor(-130 / CONFIG.blockSize)) return;
    const body = new THREE.Mesh(this.catalog.geometries.box, this.catalog.materials.buildings[2]);
    body.position.set(520, 5.4, -130);
    body.scale.set(42, 10.8, 34);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);
    const opening = new THREE.Mesh(this.catalog.geometries.box, this.catalog.materials.warehouseDoor);
    opening.position.set(520, 3.2, -112.8);
    opening.scale.set(17, 6.4, 0.35);
    group.add(opening);
    const roof = new THREE.Mesh(this.catalog.geometries.box, this.catalog.materials.roof);
    roof.position.set(520, 11, -130);
    roof.scale.set(44, 0.8, 36);
    group.add(roof);
    const sign = new THREE.Mesh(this.catalog.geometries.box, this.catalog.materials.roadSign);
    sign.position.set(520, 8, -111.8);
    sign.scale.set(11, 1.15, 0.22);
    group.add(sign);
    const parking = new THREE.Mesh(this.catalog.geometries.box, this.catalog.materials.asphalt);
    parking.position.set(520, 0.015, -214);
    parking.scale.set(172, 0.05, 48);
    parking.receiveShadow = true;
    group.add(parking);
    for (let index = 0; index < 6; index += 1) {
      const stripe = new THREE.Mesh(this.catalog.geometries.box, this.catalog.materials.whiteLine);
      stripe.position.set(440 + index * 28, 0.05, -214);
      stripe.scale.set(0.22, 0.025, 36);
      group.add(stripe);
    }
    group.userData.garagePosition = { x: 520, z: -130 };
  }

  addAirport(group, cellX, cellZ) {
    const size = CONFIG.blockSize;
    const left = Math.max(cellX * size, 3380);
    const right = Math.min((cellX + 1) * size, 4420);
    const top = Math.max(cellZ * size, -1250);
    const bottom = Math.min((cellZ + 1) * size, -1150);
    if (left < right && top < bottom) {
      const runway = new THREE.Mesh(this.catalog.geometries.box, this.catalog.materials.freeway);
      runway.position.set((left + right) * 0.5, 0.04, (top + bottom) * 0.5);
      runway.scale.set(right - left, 0.1, bottom - top);
      runway.receiveShadow = true;
      group.add(runway);
      if (cellX % 2 === 0) {
        const centerline = new THREE.Mesh(this.catalog.geometries.box, this.catalog.materials.whiteLine);
        centerline.position.set((left + right) * 0.5, 0.11, -1200);
        centerline.scale.set(Math.min(right - left - 18, 80), 0.025, 1.2);
        group.add(centerline);
      }
    }
    for (const x of [3650, 4150]) {
      if (Math.floor(x / size) !== cellX || Math.floor(-1380 / size) !== cellZ) continue;
      const hangar = new THREE.Mesh(this.catalog.geometries.box, this.catalog.materials.buildings[6]);
      hangar.position.set(x, 8, -1380);
      hangar.scale.set(94, 16, 58);
      hangar.castShadow = true;
      group.add(hangar);
      const door = new THREE.Mesh(this.catalog.geometries.box, this.catalog.materials.warehouseDoor);
      door.position.set(x, 4.5, -1349);
      door.scale.set(29, 9, 0.4);
      group.add(door);
    }
  }

  addHarbor(group, cellX, cellZ) {
    const size = CONFIG.blockSize;
    const startX = cellX * size;
    const endX = startX + size;
    for (const dockX of [2400, 2580, 2760]) {
      if (dockX < startX - 8 || dockX > endX + 8) continue;
      const coast = coastlineAt(dockX);
      const startZ = coast - 84;
      const endZ = coast + 360;
      const chunkStartZ = cellZ * size;
      const chunkEndZ = chunkStartZ + size;
      const segmentStart = Math.max(startZ, chunkStartZ);
      const segmentEnd = Math.min(endZ, chunkEndZ);
      if (segmentStart >= segmentEnd) continue;
      const pier = new THREE.Mesh(this.catalog.geometries.box, this.catalog.materials.dock);
      pier.position.set(dockX, 0.22, (segmentStart + segmentEnd) * 0.5);
      pier.scale.set(13, 0.42, segmentEnd - segmentStart);
      pier.castShadow = true;
      pier.receiveShadow = true;
      group.add(pier);
      for (const side of [-1, 1]) {
        const rail = new THREE.Mesh(this.catalog.geometries.box, this.catalog.materials.trim);
        rail.position.set(dockX + side * 6.2, 0.7, (segmentStart + segmentEnd) * 0.5);
        rail.scale.set(0.28, 0.85, segmentEnd - segmentStart);
        group.add(rail);
      }
    }
    if (cellX === Math.floor(2580 / size) && cellZ === Math.floor(1500 / size)) {
      const shed = new THREE.Mesh(this.catalog.geometries.box, this.catalog.materials.terracotta);
      shed.position.set(2690, 4.2, 1470);
      shed.scale.set(48, 8, 35);
      shed.castShadow = true;
      group.add(shed);
    }
  }

  addStreetlights(group, cellX, cellZ) {
    const edges = [this.roads.getEdge("horizontal", cellX, cellZ), this.roads.getEdge("vertical", cellX, cellZ)];
    group.userData.nightLights ??= [];
    for (const edge of edges) {
      if (!edge || edge.isFreeway || edge.isTunnel) continue;
      const horizontal = edge.axis === "horizontal";
      const x = edge.startX + (edge.endX - edge.startX) * 0.58 + (horizontal ? 0 : edge.width * 0.5 + 4.5);
      const z = edge.startZ + (edge.endZ - edge.startZ) * 0.58 + (horizontal ? edge.width * 0.5 + 4.5 : 0);
      const pole = new THREE.Mesh(this.catalog.geometries.cylinder, this.catalog.materials.trim);
      pole.position.set(x, 3.3, z);
      pole.scale.set(0.16, 6.6, 0.16);
      pole.castShadow = true;
      group.add(pole);
      const arm = new THREE.Mesh(this.catalog.geometries.box, this.catalog.materials.trim);
      arm.position.set(x + (horizontal ? 0 : -1.3), 6.45, z + (horizontal ? -1.3 : 0));
      arm.scale.set(horizontal ? 0.22 : 2.8, 0.2, horizontal ? 2.8 : 0.22);
      group.add(arm);
      const head = new THREE.Mesh(this.catalog.geometries.sphere, this.catalog.materials.streetlight);
      head.position.copy(arm.position);
      head.scale.set(0.3, 0.13, 0.3);
      group.add(head);
      let glow = null;
      if (Math.abs(cellX * 7 + cellZ) % 7 === 0) {
        glow = new THREE.PointLight(0xffcf82, 0, 46, 2);
        glow.position.copy(head.position);
        group.add(glow);
      }
      group.userData.nightLights.push({ head, glow });
    }
  }

  updateEnvironment(deltaSeconds, daylight) {
    this.environmentTime += deltaSeconds;
    const night = 1 - daylight;
    if (this.catalog?.materials?.streetlight) {
      this.catalog.materials.streetlight.emissiveIntensity = 0.12 + Math.max(0, night - 0.36) * 2.6;
    }
    for (const chunk of this.chunks.values()) {
      for (const crown of chunk.windObjects) {
        const sign = crown.isMesh;
        crown.rotation.z = Math.sin(this.environmentTime * 0.65 + crown.userData.windPhase) * (sign ? 0.012 : 0.035);
        crown.rotation.x = Math.cos(this.environmentTime * 0.48 + crown.userData.windPhase) * (sign ? 0.007 : 0.025);
      }
      for (const lamp of chunk.nightLights) {
        if (lamp.glow) lamp.glow.intensity = night > 0.48 ? 8 * Math.min(1, (night - 0.48) * 3) : 0;
      }
    }
  }

  getColliders() {
    if (this.activeInterior) {
      return [];
    }

    if (!this.collidersDirty) {
      return this.colliders;
    }

    this.colliders.length = 0;
    for (const chunk of this.chunks.values()) {
      this.colliders.push(...chunk.colliders);
    }

    this.collidersDirty = false;
    return this.colliders;
  }

  buildingDistrictAt(x, z) {
    const coastDistance = coastlineAt(x) - z;

    if (Math.abs(x) < 650 && Math.abs(z) < 650) return "downtown";
    if (x < -1000 && coastDistance > 560 && coastDistance < 1500) return "hillside";
    if (coastDistance < 560) return "coast";
    if (z < -580 && x < -1050) return "hillside";
    if (z < -620 && Math.abs(x) < 2400) return "suburban";
    if (x > 1450 && z > -2700) return "industrial";
    return "mixed";
  }

  findNearestInterior(position, maximumDistance = 14) {
    if (this.activeInterior) return null;

    const maximumDistanceSquared = maximumDistance * maximumDistance;
    const cellX = Math.floor(position.x / CONFIG.blockSize);
    const cellZ = Math.floor(position.z / CONFIG.blockSize);
    const spread = Math.ceil(maximumDistance / CONFIG.blockSize);
    let nearest = null;
    let nearestDistanceSquared = maximumDistanceSquared;

    for (let offsetZ = -spread; offsetZ <= spread; offsetZ += 1) {
      for (let offsetX = -spread; offsetX <= spread; offsetX += 1) {
        const chunk = this.chunks.get((cellX + offsetX) + ":" + (cellZ + offsetZ));
        if (!chunk) continue;

        for (const collider of chunk.colliders) {
          if (!collider.interior) continue;
          const dx = position.x - collider.interior.doorX;
          const dz = position.z - collider.interior.doorZ;
          const distanceSquared = dx * dx + dz * dz;

          if (distanceSquared < nearestDistanceSquared) {
            nearest = collider.interior;
            nearestDistanceSquared = distanceSquared;
          }
        }
      }
    }

    return nearest;
  }

  enterInterior(player, interior) {
    if (!interior || this.activeInterior) return false;

    this.interiorExteriorPosition = {
      x: player.position.x,
      y: player.position.y,
      z: player.position.z,
      heading: player.group.rotation.y
    };
    this.activeInterior = interior;
    this.summitGroup.visible = false;

    for (const chunk of this.chunks.values()) {
      chunk.group.visible = false;
    }

    if (this.interiorGroup && this.interiorGroup.userData.archetype !== interior.archetype) {
      this.scene.remove(this.interiorGroup);
      this.interiorGroup = null;
    }

    if (!this.interiorGroup) {
      this.interiorGroup = this.createInteriorRoom(interior.archetype);
      this.scene.add(this.interiorGroup);
    }

    this.interiorGroup.visible = true;
    player.inInterior = true;
    player.position.set(0, 0.22, 0);
    player.group.rotation.y = 0;
    player.floorY = 0.22;
    player.group.visible = true;
    player.grounded = true;
    player.velocityY = 0;
    return true;
  }

  exitInterior(player) {
    if (!this.activeInterior || !this.interiorExteriorPosition) return false;

    const saved = this.interiorExteriorPosition;
    this.interiorGroup.visible = false;
    for (const chunk of this.chunks.values()) {
      chunk.group.visible = true;
    }
    this.summitGroup.visible = true;

    player.inInterior = false;
    player.position.set(saved.x, saved.y, saved.z);
    player.group.rotation.y = saved.heading;
    player.floorY = player.surfaceHeight(saved.x, saved.z);
    player.position.y = player.floorY;
    player.group.visible = true;
    player.grounded = true;
    player.velocityY = 0;
    this.activeInterior = null;
    this.interiorExteriorPosition = null;
    return true;
  }

  createInteriorRoom(archetype) {
    const room = new THREE.Group();
    room.userData.archetype = archetype;
    const box = this.catalog.geometries.box;
    const wall = this.catalog.materials.stone;
    const floor = new THREE.Mesh(box, this.catalog.materials.roof);
    floor.position.set(0, -0.1, 0);
    floor.scale.set(34, 0.3, 28);
    floor.receiveShadow = true;
    room.add(floor);

    const rear = new THREE.Mesh(box, wall);
    rear.position.set(0, 5, -14);
    rear.scale.set(34, 10, 0.55);
    room.add(rear);

    for (const side of [-1, 1]) {
      const sideWall = new THREE.Mesh(box, wall);
      sideWall.position.set(side * 17, 5, 0);
      sideWall.scale.set(0.55, 10, 28);
      room.add(sideWall);
    }

    for (const side of [-1, 1]) {
      const frontWing = new THREE.Mesh(box, wall);
      frontWing.position.set(side * 12, 5, 14);
      frontWing.scale.set(10, 10, 0.55);
      room.add(frontWing);
    }

    const frontLintel = new THREE.Mesh(box, wall);
    frontLintel.position.set(0, 9.1, 14);
    frontLintel.scale.set(14, 1.8, 0.55);
    room.add(frontLintel);

    const ceiling = new THREE.Mesh(box, this.catalog.materials.roof);
    ceiling.position.set(0, 10.15, 0);
    ceiling.scale.set(34, 0.4, 28);
    room.add(ceiling);

    if (archetype === "shop" || archetype === "restaurant") {
      const counter = new THREE.Mesh(box, this.catalog.materials.trim);
      counter.position.set(0, 1.35, 4.8);
      counter.scale.set(10, 1.6, 1.7);
      counter.castShadow = true;
      room.add(counter);

      for (const side of [-1, 1]) {
        const shelf = new THREE.Mesh(box, this.catalog.materials.buildings[side < 0 ? 1 : 4]);
        shelf.position.set(side * 12, 2.8, -1.5);
        shelf.scale.set(1, 5.3, 13);
        shelf.castShadow = true;
        room.add(shelf);
      }
    } else if (archetype === "hotel") {
      const reception = new THREE.Mesh(box, this.catalog.materials.stone);
      reception.position.set(0, 1.4, -5.5);
      reception.scale.set(12, 1.8, 2.1);
      reception.castShadow = true;
      room.add(reception);

      for (const side of [-1, 1]) {
        const seat = new THREE.Mesh(box, this.catalog.materials.buildings[side < 0 ? 2 : 6]);
        seat.position.set(side * 9, 0.8, 4.5);
        seat.scale.set(5, 1.2, 2.2);
        room.add(seat);
      }
    } else {
      const welcomeDesk = new THREE.Mesh(box, this.catalog.materials.stone);
      welcomeDesk.position.set(0, 1.2, 1.5);
      welcomeDesk.scale.set(8, 1.5, 1.5);
      room.add(welcomeDesk);

      for (const side of [-1, 1]) {
        const column = new THREE.Mesh(box, this.catalog.materials.deco);
        column.position.set(side * 10, 3.4, -6);
        column.scale.set(1.1, 6.8, 1.1);
        room.add(column);
      }
    }

    const light = new THREE.PointLight(0xffd4a0, 105, 38, 1.7);
    light.position.set(0, 8.8, 0);
    room.add(light);

    return room;
  }

  areaName(position) {
    if (Math.hypot(position.x - 3900, position.z + 1200) < 630) return "AIRFIELD";
    if (Math.hypot(position.x + 1300, position.z - 380) < 520) return "CYPRESS PARK";
    if (Math.hypot(position.x - 2580, position.z - 1310) < 520) return "SOUTH HARBOR";
    if (Math.hypot(position.x + 520, position.z + 2100) < 820) return "SUMMIT TRAIL";
    const coastDistance = coastlineAt(position.x) - position.z;

    if (coastDistance < 480) {
      return "OCEANFRONT";
    }

    if (Math.abs(position.x) < 850 && Math.abs(position.z) < 850) {
      return "DOWNTOWN";
    }

    if (position.x < -1500) {
      return "WESTSIDE";
    }

    if (position.x > 1500) {
      return "EASTSIDE";
    }

    return "UPTOWN";
  }
}
