import * as THREE from "three";
import { CONFIG } from "../config.js";
import { hash2, unitFromHash } from "../core/random.js";

const EDGE_HORIZONTAL = 0x21f0aaad;
const EDGE_VERTICAL = 0x735a2d97;
const ROAD_STYLE = 0x41c64e6d;
const SUMMIT_X = -520;
const SUMMIT_Z = -2100;
const SUMMIT_RADIUS = 800;

export function coastlineAt(x) {
  return CONFIG.coastBaseZ +
    Math.sin(x * 0.0011) * 105 +
    Math.sin(x * 0.0027 + 1.7) * 42 +
    Math.sin(x * 0.00043) * 85;
}

export class RoadNetwork {
  constructor(seed, catalog) {
    this.seed = seed >>> 0;
    this.catalog = catalog;
    this.edgeCache = new Map();
    this.blockSize = CONFIG.blockSize;
    this.signalTime = 0;
    this.signalMeshes = new Map();
    this.mountainRoadWidth = 16;
    this.mountainRoadSegments = [];
    this.mountainSegmentsByCell = new Map();
    this.mountainRenderSegmentsByCell = new Map();
    this.createMountainRoadRoute();
  }

  edgeKey(axis, gridX, gridZ) {
    return axis + ":" + gridX + ":" + gridZ;
  }

  getEdge(axis, gridX, gridZ) {
    const key = this.edgeKey(axis, gridX, gridZ);

    if (this.edgeCache.has(key)) {
      return this.edgeCache.get(key);
    }

    const edge = this.createEdge(axis, gridX, gridZ);
    this.edgeCache.set(key, edge);

    return edge;
  }

  createEdge(axis, gridX, gridZ) {
    const salt = axis === "horizontal"
      ? EDGE_HORIZONTAL
      : EDGE_VERTICAL;
    const presenceHash = hash2(
      this.seed,
      gridX,
      gridZ,
      salt
    );
    const styleHash = hash2(
      this.seed,
      gridX,
      gridZ,
      ROAD_STYLE ^ salt
    );

    const size = this.blockSize;
    const x1 = gridX * size;
    const z1 = gridZ * size;
    const x2 = axis === "horizontal" ? x1 + size : x1;
    const z2 = axis === "vertical" ? z1 + size : z1;
    const centerX = (x1 + x2) * 0.5;
    const centerZ = (z1 + z2) * 0.5;

    if (Math.abs(centerX) > CONFIG.cityHalfWidth) {
      return null;
    }

    if (centerZ >= coastlineAt(centerX) - 5) {
      return null;
    }

    const isFreeway = axis === "horizontal" && gridZ === CONFIG.freewayGridZ;
    const isTunnel = axis === "horizontal" &&
      gridZ === CONFIG.tunnelGridZ &&
      Math.abs(centerX) <= CONFIG.tunnelHalfLength;
    const isBridge = axis === "vertical" &&
      gridX === CONFIG.bridgeGridX &&
      gridZ >= CONFIG.bridgeStartGridZ &&
      gridZ <= CONFIG.bridgeEndGridZ;
    const isArterial = axis === "horizontal"
      ? gridZ % 4 === 0
      : gridX % 5 === 0;
    const isMountainRoad = (axis === "horizontal" &&
      gridZ >= -12 && gridZ <= -8 &&
      gridX >= -5 && gridX <= 4) ||
      (axis === "vertical" && (
        (gridX === 5 && (gridZ === -9 || gridZ === -11)) ||
        (gridX === -5 && (gridZ === -10 || gridZ === -12)) ||
        (gridX === -2 && gridZ === -13)
      ));
    const closestX = axis === "horizontal"
      ? Math.max(x1, Math.min(x2, SUMMIT_X))
      : x1;
    const closestZ = axis === "vertical"
      ? Math.max(z1, Math.min(z2, SUMMIT_Z))
      : z1;
    const cutsThroughSummit = Math.hypot(closestX - SUMMIT_X, closestZ - SUMMIT_Z) <
      SUMMIT_RADIUS + 18;
    const summitEntry = axis === "horizontal" && gridZ === CONFIG.freewayGridZ && gridX === -2;
    if (cutsThroughSummit && !summitEntry) return null;
    const isRamp = axis === "vertical" &&
      Math.abs(gridX) % 8 === 0 &&
      gridZ >= CONFIG.freewayGridZ - 2 &&
      gridZ <= CONFIG.freewayGridZ;
    const isLandmarkRoad = isFreeway || isTunnel || isBridge || isRamp || isArterial || isMountainRoad;

    if (!isLandmarkRoad && unitFromHash(presenceHash) > CONFIG.roadChance) {
      return null;
    }

    const widthIndex = styleHash % CONFIG.roadWidths.length;

    return {
      axis,
      gridX,
      gridZ,
      startX: x1,
      startZ: z1,
      endX: x2,
      endZ: z2,
      centerX,
      centerZ,
      width: isFreeway ? 36 : isBridge ? 26 : isTunnel ? 28 : isRamp ? 18 : isMountainRoad ? 16 : isArterial ? 26 : CONFIG.roadWidths[widthIndex],
      isAvenue: isFreeway || (!isMountainRoad && (isArterial || widthIndex >= 3)),
      isFreeway,
      isTunnel,
      isBridge,
      isRamp,
      isMountainRoad,
      styleHash
    };
  }

  getNeighbors(nodeX, nodeZ) {
    const candidates = [
      {
        direction: "east",
        axis: "horizontal",
        gridX: nodeX,
        gridZ: nodeZ,
        nextX: nodeX + 1,
        nextZ: nodeZ
      },
      {
        direction: "west",
        axis: "horizontal",
        gridX: nodeX - 1,
        gridZ: nodeZ,
        nextX: nodeX - 1,
        nextZ: nodeZ
      },
      {
        direction: "south",
        axis: "vertical",
        gridX: nodeX,
        gridZ: nodeZ,
        nextX: nodeX,
        nextZ: nodeZ + 1
      },
      {
        direction: "north",
        axis: "vertical",
        gridX: nodeX,
        gridZ: nodeZ - 1,
        nextX: nodeX,
        nextZ: nodeZ - 1
      }
    ];
    const neighbors = [];

    for (const candidate of candidates) {
      const edge = this.getEdge(
        candidate.axis,
        candidate.gridX,
        candidate.gridZ
      );

      if (!edge) {
        continue;
      }

      neighbors.push({
        ...candidate,
        edge
      });
    }

    return neighbors;
  }

  getEdgeBetween(fromX, fromZ, toX, toZ) {
    if (fromZ === toZ) {
      return this.getEdge(
        "horizontal",
        Math.min(fromX, toX),
        fromZ
      );
    }

    if (fromX === toX) {
      return this.getEdge(
        "vertical",
        fromX,
        Math.min(fromZ, toZ)
      );
    }

    return null;
  }

  findRoute(fromX, fromZ, toX, toZ) {
    const start = { x: Math.round(fromX / this.blockSize), z: Math.round(fromZ / this.blockSize) };
    const goal = { x: Math.round(toX / this.blockSize), z: Math.round(toZ / this.blockSize) };
    const keyOf = (node) => node.x + ":" + node.z;
    const startKey = keyOf(start);
    const goalKey = keyOf(goal);
    const costs = new Map([[startKey, 0]]);
    const previous = new Map();
    const frontier = new MinHeap();
    frontier.push({ ...start, priority: manhattan(start, goal) });
    let reached = false;
    let visits = 0;

    while (frontier.size && visits < 1800) {
      const current = frontier.pop();
      const currentKey = keyOf(current);
      if (currentKey === goalKey) {
        reached = true;
        break;
      }
      visits += 1;
      const currentCost = costs.get(currentKey);
      for (const neighbor of this.getNeighbors(current.x, current.z)) {
        const next = { x: neighbor.nextX, z: neighbor.nextZ };
        const nextKey = keyOf(next);
        const roadPenalty = neighbor.edge.isFreeway ? 1.5 : 0;
        const nextCost = currentCost + 1 + roadPenalty;
        if (costs.has(nextKey) && costs.get(nextKey) <= nextCost) continue;
        costs.set(nextKey, nextCost);
        previous.set(nextKey, currentKey);
        frontier.push({ ...next, priority: nextCost + manhattan(next, goal) });
      }
    }

    if (!reached) return [{ x: fromX, z: fromZ }, { x: toX, z: toZ }];
    const path = [];
    let key = goalKey;
    while (key !== startKey) {
      const [x, z] = key.split(":").map(Number);
      path.push({ x: x * this.blockSize, z: z * this.blockSize });
      key = previous.get(key);
      if (!key) return [{ x: fromX, z: fromZ }, { x: toX, z: toZ }];
    }
    path.push({ x: start.x * this.blockSize, z: start.z * this.blockSize });
    path.reverse();
    path[0] = { x: fromX, z: fromZ };
    path.push({ x: toX, z: toZ });
    return path;
  }

  pruneCache(centerX, centerZ, radius) {
    for (const key of this.edgeCache.keys()) {
      const [axis, gridXText, gridZText] = key.split(":");
      const gridX = Number(gridXText);
      const gridZ = Number(gridZText);

      if (
        (axis !== "horizontal" && axis !== "vertical") ||
        Math.abs(gridX - centerX) > radius ||
        Math.abs(gridZ - centerZ) > radius
      ) {
        this.edgeCache.delete(key);
      }
    }

    const signalRadius = Math.max(0, radius - 2);
    for (const [key, light] of this.signalMeshes) {
      if (Math.abs(light.nodeX - centerX) > signalRadius || Math.abs(light.nodeZ - centerZ) > signalRadius) {
        this.signalMeshes.delete(key);
      }
    }
  }

  addBlockRoads(group, blockX, blockZ) {
    const topEdge = this.getEdge("horizontal", blockX, blockZ);
    const leftEdge = this.getEdge("vertical", blockX, blockZ);
    const yellowMarks = [];
    const whiteMarks = [];
    const sidewalks = [];
    const curbs = [];

    if (topEdge) {
      this.addRoadSegment(group, topEdge, yellowMarks, whiteMarks, sidewalks, curbs);
    }

    if (leftEdge) {
      this.addRoadSegment(group, leftEdge, yellowMarks, whiteMarks, sidewalks, curbs);
    }

    this.addIntersection(group, blockX, blockZ);
    this.addMountainRoad(group, blockX, blockZ);
    this.addScaledInstances(group, sidewalks, this.catalog.materials.sidewalk);
    this.addScaledInstances(group, curbs, this.catalog.materials.curb);
    this.addMarkInstances(group, yellowMarks, this.catalog.materials.yellowLine);
    this.addMarkInstances(group, whiteMarks, this.catalog.materials.whiteLine);
  }

  createMountainRoadRoute() {
    const centerX = -520;
    const centerZ = -2100;
    const baseRadius = 800;
    const summitRadius = 170;
    const summitHeight = 220;
    const controlPoints = [];
    const turnCount = 5;
    const controlCount = turnCount * 20;

    for (let index = 0; index <= controlCount; index += 1) {
      const progress = index / controlCount;
      const angle = Math.PI * 0.5 - progress * Math.PI * turnCount * 2;
      const radius = baseRadius - (baseRadius - summitRadius) * progress;
      const elevation = 0.28 + summitHeight * (1 - radius / baseRadius);
      controlPoints.push(new THREE.Vector3(
        centerX + Math.cos(angle) * radius,
        elevation,
        centerZ + Math.sin(angle) * radius
      ));
    }

    const curve = new THREE.CatmullRomCurve3(controlPoints, false, "centripetal");
    const routePoints = curve.getPoints(controlCount * 8);
    for (const point of routePoints) {
      const radius = Math.min(baseRadius, Math.hypot(point.x - centerX, point.z - centerZ));
      point.y = 0.28 + summitHeight * (1 - radius / baseRadius);
    }

    for (let index = 0; index < routePoints.length - 1; index += 1) {
      const start = routePoints[index];
      const end = routePoints[index + 1];
      const midpointX = (start.x + end.x) * 0.5;
      const midpointZ = (start.z + end.z) * 0.5;
      const cellX = Math.floor(midpointX / this.blockSize);
      const cellZ = Math.floor(midpointZ / this.blockSize);
      const segment = { start, end, index, cellX, cellZ };
      this.mountainRoadSegments.push(segment);
      const renderKey = cellX + ":" + cellZ;
      let renderSegments = this.mountainRenderSegmentsByCell.get(renderKey);
      if (!renderSegments) {
        renderSegments = [];
        this.mountainRenderSegmentsByCell.set(renderKey, renderSegments);
      }
      renderSegments.push(segment);

      const halfWidth = this.mountainRoadWidth * 0.5 + 1;
      const minCellX = Math.floor((Math.min(start.x, end.x) - halfWidth) / this.blockSize);
      const maxCellX = Math.floor((Math.max(start.x, end.x) + halfWidth) / this.blockSize);
      const minCellZ = Math.floor((Math.min(start.z, end.z) - halfWidth) / this.blockSize);
      const maxCellZ = Math.floor((Math.max(start.z, end.z) + halfWidth) / this.blockSize);

      for (let gridZ = minCellZ; gridZ <= maxCellZ; gridZ += 1) {
        for (let gridX = minCellX; gridX <= maxCellX; gridX += 1) {
          const key = gridX + ":" + gridZ;
          let cellSegments = this.mountainSegmentsByCell.get(key);
          if (!cellSegments) {
            cellSegments = [];
            this.mountainSegmentsByCell.set(key, cellSegments);
          }
          cellSegments.push(segment);
        }
      }
    }
  }

  addMountainRoad(group, cellX, cellZ) {
    const segments = this.mountainRenderSegmentsByCell.get(cellX + ":" + cellZ);
    if (!segments?.length) return;

    const roadPositions = [];
    const roadIndices = [];
    const centerMarkPositions = [];
    const centerMarkIndices = [];
    const edgeMarkPositions = [];
    const edgeMarkIndices = [];
    const railInstances = new THREE.InstancedMesh(
      this.catalog.geometries.box,
      this.catalog.materials.barrier,
      segments.length * 2
    );
    const reflectors = new THREE.InstancedMesh(
      this.catalog.geometries.box,
      this.catalog.materials.whiteLine,
      Math.ceil(segments.length / 2) * 2
    );
    const transform = new THREE.Object3D();
    let railIndex = 0;
    let reflectorIndex = 0;
    const halfRoadWidth = this.mountainRoadWidth * 0.5;

    for (const segment of segments) {
      const { start, end } = segment;
      const dx = end.x - start.x;
      const dz = end.z - start.z;
      const horizontalLength = Math.hypot(dx, dz);
      if (horizontalLength < 0.01) continue;
      const sideX = dz / horizontalLength;
      const sideZ = -dx / horizontalLength;
      const base = roadPositions.length / 3;

      roadPositions.push(
        start.x + sideX * halfRoadWidth, start.y, start.z + sideZ * halfRoadWidth,
        start.x - sideX * halfRoadWidth, start.y, start.z - sideZ * halfRoadWidth,
        end.x + sideX * halfRoadWidth, end.y, end.z + sideZ * halfRoadWidth,
        end.x - sideX * halfRoadWidth, end.y, end.z - sideZ * halfRoadWidth
      );
      roadIndices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);

      const markOffset = 0.18;
      for (const markSide of [-1, 1]) {
        const markBase = centerMarkPositions.length / 3;
        const markX = sideX * markOffset * markSide;
        const markZ = sideZ * markOffset * markSide;
        centerMarkPositions.push(
          start.x + markX, start.y + 0.035, start.z + markZ,
          start.x + markX + sideX * 0.085, start.y + 0.035, start.z + markZ + sideZ * 0.085,
          end.x + markX, end.y + 0.035, end.z + markZ,
          end.x + markX + sideX * 0.085, end.y + 0.035, end.z + markZ + sideZ * 0.085
        );
        centerMarkIndices.push(markBase, markBase + 2, markBase + 1, markBase + 1, markBase + 2, markBase + 3);
      }

      for (const edgeSide of [-1, 1]) {
        const edgeBase = edgeMarkPositions.length / 3;
        const edgeOffset = edgeSide * (halfRoadWidth - 0.85);
        const edgeHalfWidth = 0.065;
        edgeMarkPositions.push(
          start.x + sideX * (edgeOffset - edgeHalfWidth), start.y + 0.04, start.z + sideZ * (edgeOffset - edgeHalfWidth),
          start.x + sideX * (edgeOffset + edgeHalfWidth), start.y + 0.04, start.z + sideZ * (edgeOffset + edgeHalfWidth),
          end.x + sideX * (edgeOffset - edgeHalfWidth), end.y + 0.04, end.z + sideZ * (edgeOffset - edgeHalfWidth),
          end.x + sideX * (edgeOffset + edgeHalfWidth), end.y + 0.04, end.z + sideZ * (edgeOffset + edgeHalfWidth)
        );
        edgeMarkIndices.push(edgeBase, edgeBase + 1, edgeBase + 2, edgeBase + 1, edgeBase + 3, edgeBase + 2);
      }

      const yaw = Math.atan2(dx, dz);
      const pitch = -Math.atan2(end.y - start.y, horizontalLength);
      const midpointY = (start.y + end.y) * 0.5;
      for (const side of [-1, 1]) {
        transform.position.set(
          (start.x + end.x) * 0.5 + sideX * (halfRoadWidth - 0.35) * side,
          midpointY + 0.62,
          (start.z + end.z) * 0.5 + sideZ * (halfRoadWidth - 0.35) * side
        );
        transform.rotation.set(pitch, yaw, 0, "YXZ");
        transform.scale.set(0.22, 0.9, horizontalLength + 0.2);
        transform.updateMatrix();
        railInstances.setMatrixAt(railIndex++, transform.matrix);

        if (segment.index % 2 === 0) {
          transform.position.set(
            (start.x + end.x) * 0.5 + sideX * (halfRoadWidth + 0.28) * side,
            midpointY + 0.43,
            (start.z + end.z) * 0.5 + sideZ * (halfRoadWidth + 0.28) * side
          );
          transform.rotation.set(0, yaw, 0);
          transform.scale.set(0.14, 0.78, 0.14);
          transform.updateMatrix();
          reflectors.setMatrixAt(reflectorIndex++, transform.matrix);
        }
      }
    }

    const roadGeometry = new THREE.BufferGeometry();
    roadGeometry.setAttribute("position", new THREE.Float32BufferAttribute(roadPositions, 3));
    roadGeometry.setIndex(roadIndices);
    roadGeometry.computeVertexNormals();
    const road = new THREE.Mesh(roadGeometry, this.catalog.materials.mountainRoad);
    road.receiveShadow = true;
    group.add(road);

    const markingGeometry = new THREE.BufferGeometry();
    markingGeometry.setAttribute("position", new THREE.Float32BufferAttribute(centerMarkPositions, 3));
    markingGeometry.setIndex(centerMarkIndices);
    markingGeometry.computeVertexNormals();
    const markings = new THREE.Mesh(markingGeometry, this.catalog.materials.yellowLine);
    markings.receiveShadow = false;
    group.add(markings);

    const edgeMarkGeometry = new THREE.BufferGeometry();
    edgeMarkGeometry.setAttribute("position", new THREE.Float32BufferAttribute(edgeMarkPositions, 3));
    edgeMarkGeometry.setIndex(edgeMarkIndices);
    edgeMarkGeometry.computeVertexNormals();
    const edgeMarkings = new THREE.Mesh(edgeMarkGeometry, this.catalog.materials.whiteLine);
    edgeMarkings.receiveShadow = false;
    group.add(edgeMarkings);

    railInstances.count = railIndex;
    railInstances.instanceMatrix.needsUpdate = true;
    railInstances.castShadow = false;
    railInstances.receiveShadow = true;
    group.add(railInstances);

    reflectors.count = reflectorIndex;
    reflectors.instanceMatrix.needsUpdate = true;
    reflectors.castShadow = false;
    reflectors.receiveShadow = false;
    group.add(reflectors);
  }

  mountainRoadHeightAt(x, z) {
    const segments = this.mountainSegmentsByCell.get(
      Math.floor(x / this.blockSize) + ":" + Math.floor(z / this.blockSize)
    );
    if (!segments) return null;

    let nearestHeight = null;
    let nearestDistanceSquared = (this.mountainRoadWidth * 0.5 + 1) ** 2;
    for (const { start, end } of segments) {
      const dx = end.x - start.x;
      const dz = end.z - start.z;
      const lengthSquared = dx * dx + dz * dz;
      const progress = Math.max(0, Math.min(1, ((x - start.x) * dx + (z - start.z) * dz) / lengthSquared));
      const closestX = start.x + dx * progress;
      const closestZ = start.z + dz * progress;
      const distanceSquared = (x - closestX) ** 2 + (z - closestZ) ** 2;
      if (distanceSquared < nearestDistanceSquared) {
        nearestDistanceSquared = distanceSquared;
        nearestHeight = start.y + (end.y - start.y) * progress;
      }
    }

    return nearestHeight;
  }

  summitTerrainHeightAt(x, z) {
    const radius = Math.hypot(x - SUMMIT_X, z - SUMMIT_Z);
    return radius < SUMMIT_RADIUS
      ? 220 * (1 - radius / SUMMIT_RADIUS)
      : 0;
  }

  isNearMountainRoad(x, z, margin = 0) {
    const testRadiusSquared = (margin + this.mountainRoadWidth * 0.5) ** 2;
    for (const { start, end } of this.mountainRoadSegments) {
      const dx = end.x - start.x;
      const dz = end.z - start.z;
      const lengthSquared = dx * dx + dz * dz;
      const progress = Math.max(0, Math.min(1, ((x - start.x) * dx + (z - start.z) * dz) / lengthSquared));
      const closestX = start.x + dx * progress;
      const closestZ = start.z + dz * progress;
      if ((x - closestX) ** 2 + (z - closestZ) ** 2 <= testRadiusSquared) return true;
    }
    return false;
  }

  addRoadSegment(group, edge, yellowMarks, whiteMarks, sidewalks, curbs) {
    const size = this.blockSize;
    const sidewalk = CONFIG.sidewalkWidth;
    const overrun = edge.width * 0.55;
    const length = size + overrun * 2;
    const horizontal = edge.axis === "horizontal";
    const roadMaterial = edge.isFreeway
      ? this.catalog.materials.freeway
      : edge.isMountainRoad
        ? this.catalog.materials.mountainRoad
      : edge.isBridge || edge.isTunnel
        ? this.catalog.materials.bridge
        : this.catalog.materials.asphalt;

    const road = new THREE.Mesh(
      this.catalog.geometries.box,
      roadMaterial
    );

    road.scale.set(
      horizontal ? length : edge.width,
      CONFIG.roadHeight,
      horizontal ? edge.width : length
    );
    road.position.set(
      edge.centerX,
      CONFIG.roadHeight * 0.5,
      edge.centerZ
    );
    road.receiveShadow = true;
    group.add(road);

    if (edge.isRamp) {
      this.addRampDetails(group, edge);
    }

    if (edge.isBridge) {
      this.addBridgeDetails(group, edge, length, horizontal);
    } else if (edge.isTunnel) {
      this.addTunnelDetails(group, edge, length);
    } else if (edge.isFreeway) {
      this.addFreewayDetails(group, edge, length);
    } else {
      this.addSidewalks(edge, length, sidewalk, horizontal, sidewalks, curbs);
    }

    this.collectLaneMarks(
      edge,
      horizontal,
      yellowMarks,
      whiteMarks
    );
  }

  addSidewalks(
    edge,
    length,
    sidewalkWidth,
    horizontal,
    sidewalks,
    curbs
  ) {
    const sideOffset = edge.width * 0.5 + sidewalkWidth * 0.5;
    const curbOffset = edge.width * 0.5 + 0.12;
    const curbSize = 0.24;
    const sidewalkScale = horizontal
      ? { x: length, y: CONFIG.sidewalkHeight, z: sidewalkWidth }
      : { x: sidewalkWidth, y: CONFIG.sidewalkHeight, z: length };
    const curbScale = horizontal
      ? { x: length, y: 0.24, z: curbSize }
      : { x: curbSize, y: 0.24, z: length };
    const lateralX = horizontal ? 0 : 1;
    const lateralZ = horizontal ? 1 : 0;

    for (const side of [-1, 1]) {
      const walkX = edge.centerX + lateralX * sideOffset * side;
      const walkZ = edge.centerZ + lateralZ * sideOffset * side;
      const curbX = edge.centerX + lateralX * curbOffset * side;
      const curbZ = edge.centerZ + lateralZ * curbOffset * side;

      sidewalks.push({
        position: {
          x: walkX,
          y: CONFIG.sidewalkHeight * 0.5,
          z: walkZ
        },
        scale: sidewalkScale
      });

      curbs.push({
        position: {
          x: curbX,
          y: 0.12,
          z: curbZ
        },
        scale: curbScale
      });
    }
  }

  addScaledInstances(group, boxes, material) {
    if (boxes.length === 0) {
      return;
    }

    const instances = new THREE.InstancedMesh(
      this.catalog.geometries.box,
      material,
      boxes.length
    );
    const transform = new THREE.Object3D();

    for (let index = 0; index < boxes.length; index += 1) {
      const box = boxes[index];
      transform.position.set(box.position.x, box.position.y, box.position.z);
      transform.rotation.set(0, 0, 0);
      transform.scale.set(box.scale.x, box.scale.y, box.scale.z);
      transform.updateMatrix();
      instances.setMatrixAt(index, transform.matrix);
    }

    instances.instanceMatrix.needsUpdate = true;
    instances.receiveShadow = true;
    group.add(instances);
  }

  collectLaneMarks(edge, horizontal, yellowMarks, whiteMarks) {
    const laneGap = edge.isFreeway ? 4.2 : 1.3;
    const outerOffset = edge.width * 0.24;
    const safeStart = edge.width * 0.5 + 13;
    const safeEnd = this.blockSize - safeStart;
    const dashLength = edge.isAvenue ? 8.2 : 6.5;
    const dashSpacing = edge.isAvenue ? 25 : 30;
    const dashWidth = 0.22;
    const laneOffsetX = horizontal ? 0 : 1;
    const laneOffsetZ = horizontal ? 1 : 0;

    for (let distance = safeStart; distance < safeEnd; distance += dashSpacing) {
      const positionAlong = distance + dashLength * 0.5;
      const x = edge.startX + (horizontal ? positionAlong : 0);
      const z = edge.startZ + (horizontal ? 0 : positionAlong);

      if (!edge.isFreeway) {
        for (const side of [-1, 1]) {
          yellowMarks.push({
            x: x + laneOffsetX * laneGap * side,
            y: CONFIG.roadHeight + 0.025,
            z: z + laneOffsetZ * laneGap * side,
            scaleX: horizontal ? dashLength : dashWidth,
            scaleZ: horizontal ? dashWidth : dashLength
          });
        }
      }

      if (edge.width >= 20 || edge.isFreeway) {
        for (const side of [-1, 1]) {
          whiteMarks.push({
            x: x + laneOffsetX * outerOffset * side,
            y: CONFIG.roadHeight + 0.03,
            z: z + laneOffsetZ * outerOffset * side,
            scaleX: horizontal ? dashLength * 0.72 : dashWidth,
            scaleZ: horizontal ? dashWidth : dashLength * 0.72
          });
        }
      }

      if (edge.isFreeway) {
        for (const lane of [-1, 1]) {
          const offset = lane * (laneGap * 1.75);
          whiteMarks.push({
            x: x + laneOffsetX * offset,
            y: CONFIG.roadHeight + 0.035,
            z: z + laneOffsetZ * offset,
            scaleX: horizontal ? dashLength * 0.82 : dashWidth,
            scaleZ: horizontal ? dashWidth : dashLength * 0.82
          });
        }
      }
    }
  }

  addMarkInstances(group, marks, material) {
    if (marks.length === 0) {
      return;
    }

    const instances = new THREE.InstancedMesh(
      this.catalog.geometries.box,
      material,
      marks.length
    );
    const transform = new THREE.Object3D();

    for (let index = 0; index < marks.length; index += 1) {
      const mark = marks[index];
      transform.position.set(mark.x, mark.y, mark.z);
      transform.rotation.set(0, 0, 0);
      transform.scale.set(mark.scaleX, 0.035, mark.scaleZ);
      transform.updateMatrix();
      instances.setMatrixAt(index, transform.matrix);
    }

    instances.instanceMatrix.needsUpdate = true;
    instances.receiveShadow = true;
    group.add(instances);
  }

  addIntersection(group, nodeX, nodeZ) {
    const neighbors = this.getNeighbors(nodeX, nodeZ);

    if (neighbors.length < 2) {
      return;
    }

    const width = Math.max(...neighbors.map((neighbor) => neighbor.edge.width));
    const patch = new THREE.Mesh(
      this.catalog.geometries.circle,
      this.catalog.materials.asphalt
    );

    patch.rotation.x = -Math.PI * 0.5;
    patch.position.set(
      nodeX * this.blockSize,
      CONFIG.roadHeight + 0.012,
      nodeZ * this.blockSize
    );
    patch.scale.set(width * 0.72, width * 0.72, 1);
    patch.receiveShadow = true;
    group.add(patch);

    if (neighbors.length >= 3) {
      this.addCrosswalks(group, nodeX, nodeZ, width);
      if (this.isSignalized(nodeX, nodeZ)) this.addTrafficSignals(group, nodeX, nodeZ, width);

      if (hash2(this.seed, nodeX, nodeZ, 0x7a53c4e1) % 5 === 0) {
        this.addStreetSign(group, nodeX, nodeZ, width);
      }
    }
  }

  isSignalized(nodeX, nodeZ) {
    return hash2(this.seed, nodeX, nodeZ, 0x1a771f03) % 3 !== 0 &&
      this.getNeighbors(nodeX, nodeZ).length >= 3;
  }

  signalColor(nodeX, nodeZ, axis) {
    if (!this.isSignalized(nodeX, nodeZ)) return "green";
    const offset = hash2(this.seed, nodeX, nodeZ, 0x55ca9011) % 22000;
    const phase = (this.signalTime * 1000 + offset) % 22000;
    const horizontal = axis === "horizontal";
    if (horizontal) return phase < 9000 ? "green" : phase < 11000 ? "amber" : "red";
    return phase >= 11000 && phase < 20000 ? "green" : phase >= 20000 ? "amber" : "red";
  }

  updateSignals(deltaSeconds) {
    this.signalTime += deltaSeconds;
    for (const light of this.signalMeshes.values()) {
      const state = this.signalColor(light.nodeX, light.nodeZ, light.axis);
      for (const color of ["red", "amber", "green"]) {
        const material = light.bulbs[color].material;
        material.emissiveIntensity = state === color ? 2.4 : 0.12;
      }
    }
  }

  addTrafficSignals(group, nodeX, nodeZ, width) {
    const key = nodeX + ":" + nodeZ;
    const existing = this.signalMeshes.get(key + ":horizontal");
    if (existing) {
      for (const part of existing.parts) group.add(part);
      return;
    }
    const worldX = nodeX * this.blockSize;
    const worldZ = nodeZ * this.blockSize;
    const offset = width * 0.5 + 3.5;
    const parts = [];
    for (const axis of ["horizontal", "vertical"]) {
      const sign = axis === "horizontal" ? 1 : -1;
      const x = worldX + (axis === "vertical" ? offset : -offset);
      const z = worldZ + (axis === "horizontal" ? offset : -offset);
      const pole = new THREE.Mesh(this.catalog.geometries.cylinder, this.catalog.materials.trim);
      pole.position.set(x, 2.5, z);
      pole.scale.set(0.13, 5, 0.13);
      pole.castShadow = true;
      group.add(pole);
      parts.push(pole);
      const housing = new THREE.Mesh(this.catalog.geometries.box, this.catalog.materials.trim);
      housing.position.set(x, 4.3, z);
      housing.scale.set(0.46, 1.38, 0.32);
      group.add(housing);
      parts.push(housing);
      const bulbs = {};
      for (const [index, color] of ["red", "amber", "green"].entries()) {
        const bulb = new THREE.Mesh(this.catalog.geometries.sphere, this.catalog.materials["signal" + color[0].toUpperCase() + color.slice(1)].clone());
        bulb.position.set(x, 4.72 - index * 0.43, z + sign * 0.18);
        bulb.scale.setScalar(0.13);
        group.add(bulb);
        parts.push(bulb);
        bulbs[color] = bulb;
      }
      this.signalMeshes.set(key + ":" + axis, { nodeX, nodeZ, axis, bulbs, parts });
    }
  }

  addCrosswalks(group, nodeX, nodeZ, width) {
    const stripeWidth = 1.8;
    const stripeDepth = 0.72;
    const count = Math.max(5, Math.floor(width * 0.38));
    const spacing = stripeWidth + stripeDepth;
    const centerX = nodeX * this.blockSize;
    const centerZ = nodeZ * this.blockSize;
    const marks = new THREE.InstancedMesh(
      this.catalog.geometries.box,
      this.catalog.materials.whiteLine,
      count * 4
    );
    const transform = new THREE.Object3D();
    let markIndex = 0;

    for (const axis of ["horizontal", "vertical"]) {
      for (const side of [-1, 1]) {
        for (let stripe = 0; stripe < count; stripe += 1) {
          const across = (stripe - (count - 1) * 0.5) * spacing;
          transform.scale.set(
            axis === "horizontal" ? stripeWidth : stripeDepth,
            0.035,
            axis === "horizontal" ? stripeDepth : stripeWidth
          );
          transform.position.set(
            centerX + (axis === "horizontal" ? side * (width * 0.5 + 5) : across),
            CONFIG.roadHeight + 0.04,
            centerZ + (axis === "horizontal" ? across : side * (width * 0.5 + 5))
          );
          transform.rotation.set(0, 0, 0);
          transform.updateMatrix();
          marks.setMatrixAt(markIndex++, transform.matrix);
        }
      }
    }

    marks.count = markIndex;
    marks.instanceMatrix.needsUpdate = true;
    marks.receiveShadow = true;
    group.add(marks);
  }

  addStreetSign(group, nodeX, nodeZ, width) {
    const x = nodeX * this.blockSize + width * 0.5 + 3.4;
    const z = nodeZ * this.blockSize + width * 0.5 + 3.4;
    const pole = new THREE.Mesh(this.catalog.geometries.cylinder, this.catalog.materials.trim);
    pole.position.set(x, 2.2, z);
    pole.scale.set(0.11, 4.4, 0.11);
    pole.castShadow = true;
    group.add(pole);

    const plate = new THREE.Mesh(this.catalog.geometries.box, this.catalog.materials.roadSign);
    plate.position.set(x, 4.05, z);
    plate.scale.set(3.8, 0.92, 0.13);
    plate.castShadow = true;
    plate.userData.windPhase = x * 0.006 + z * 0.003;
    group.userData.windObjects ??= [];
    group.userData.windObjects.push(plate);
    group.add(plate);

    const lettering = new THREE.Mesh(this.catalog.geometries.box, this.catalog.materials.roadSignText);
    lettering.position.set(x, 4.06, z + 0.075);
    lettering.scale.set(2.25, 0.06, 0.025);
    group.add(lettering);
  }

  addFreewayDetails(group, edge, length) {
    const horizontal = edge.axis === "horizontal";
    const median = new THREE.Mesh(this.catalog.geometries.box, this.catalog.materials.barrier);
    median.scale.set(horizontal ? length : 0.9, 0.74, horizontal ? 0.9 : length);
    median.position.set(edge.centerX, 0.56, edge.centerZ);
    median.castShadow = true;
    median.receiveShadow = true;
    group.add(median);

    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(this.catalog.geometries.box, this.catalog.materials.barrier);
      const offset = edge.width * 0.5 - 0.65;
      rail.scale.set(horizontal ? length : 0.42, 0.82, horizontal ? 0.42 : length);
      rail.position.set(
        edge.centerX + (horizontal ? 0 : offset * side),
        0.54,
        edge.centerZ + (horizontal ? offset * side : 0)
      );
      rail.castShadow = true;
      group.add(rail);
    }

    if (Math.abs(edge.gridX) % 8 === 0) {
      const sign = new THREE.Mesh(this.catalog.geometries.box, this.catalog.materials.roadSign);
      sign.position.set(edge.centerX, 6.8, edge.centerZ - edge.width * 0.85);
      sign.scale.set(9, 2.5, 0.26);
      sign.castShadow = true;
      sign.userData.windPhase = edge.centerX * 0.006 + edge.centerZ * 0.003;
      group.userData.windObjects ??= [];
      group.userData.windObjects.push(sign);
      group.add(sign);
    }
  }

  addBridgeDetails(group, edge, length, horizontal) {
    const lateral = horizontal ? 1 : 0;
    const deckWidth = edge.width + 2;

    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(this.catalog.geometries.box, this.catalog.materials.barrier);
      rail.scale.set(horizontal ? length : 0.5, 0.9, horizontal ? 0.5 : length);
      rail.position.set(
        edge.centerX + (lateral ? 0 : deckWidth * 0.5 * side),
        0.75,
        edge.centerZ + (lateral ? deckWidth * 0.5 * side : 0)
      );
      rail.castShadow = true;
      group.add(rail);
    }

    for (const t of [0.5]) {
      const pier = new THREE.Mesh(this.catalog.geometries.box, this.catalog.materials.bridge);
      pier.scale.set(horizontal ? 2.2 : deckWidth, 3.8, horizontal ? deckWidth : 2.2);
      pier.position.set(
        edge.startX + (edge.endX - edge.startX) * t,
        -1.7,
        edge.startZ + (edge.endZ - edge.startZ) * t
      );
      pier.castShadow = true;
      group.add(pier);
    }
  }

  addTunnelDetails(group, edge, length) {
    const roof = new THREE.Mesh(this.catalog.geometries.box, this.catalog.materials.bridge);
    roof.scale.set(length, 0.8, edge.width + 4);
    roof.position.set(edge.centerX, 9, edge.centerZ);
    roof.receiveShadow = true;
    group.add(roof);

    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(this.catalog.geometries.box, this.catalog.materials.bridge);
      wall.scale.set(length, 8.5, 0.9);
      wall.position.set(edge.centerX, 4.3, edge.centerZ + side * (edge.width * 0.5 + 1.2));
      wall.receiveShadow = true;
      group.add(wall);
    }

    const entranceX = edge.gridX === -2 ? edge.startX : edge.gridX === 1 ? edge.endX : null;
    if (entranceX !== null) {
      for (const side of [-1, 1]) {
        const column = new THREE.Mesh(this.catalog.geometries.box, this.catalog.materials.bridge);
        column.scale.set(2.5, 8.5, 2.5);
        column.position.set(entranceX, 4.3, edge.centerZ + side * (edge.width * 0.5 + 2));
        column.castShadow = true;
        group.add(column);
      }
    }
  }

  addRampDetails(group, edge) {
    const rampStartZ = CONFIG.freewayGridZ * this.blockSize;
    const nearZ = Math.abs(edge.startZ - rampStartZ) < Math.abs(edge.endZ - rampStartZ)
      ? edge.startZ
      : edge.endZ;
    const marks = new THREE.InstancedMesh(
      this.catalog.geometries.box,
      this.catalog.materials.whiteLine,
      4
    );
    const transform = new THREE.Object3D();
    let index = 0;

    for (const side of [-1, 1]) {
      for (const offset of [-1, 1]) {
        transform.position.set(
          edge.centerX + side * (edge.width * 0.27),
          CONFIG.roadHeight + 0.04,
          nearZ + offset * 7
        );
        transform.rotation.set(0, side * 0.28, 0);
        transform.scale.set(1.4, 0.035, 15);
        transform.updateMatrix();
        marks.setMatrixAt(index++, transform.matrix);
      }
    }

    marks.instanceMatrix.needsUpdate = true;
    group.add(marks);
  }

  isOnLand(x, z) {
    const bridgeX = CONFIG.bridgeGridX * CONFIG.blockSize;
    const bridgeStart = CONFIG.bridgeStartGridZ * CONFIG.blockSize;
    const bridgeEnd = (CONFIG.bridgeEndGridZ + 1) * CONFIG.blockSize;
    const bridgeDeck = Math.abs(x - bridgeX) <= 15 && z >= bridgeStart && z <= bridgeEnd;
    const canal = Math.abs(z - CONFIG.canalCenterZ) <= CONFIG.canalWidth * 0.5 &&
      Math.abs(x - bridgeX) <= CONFIG.canalHalfLength;
    const coast = coastlineAt(x);
    const beach = z <= coast + 1;
    const dock = [2400, 2580, 2760].some((dockX) =>
      Math.abs(x - dockX) <= 7.4 && z <= coastlineAt(dockX) + 360 && z > coastlineAt(dockX) - 90
    );

    return Math.abs(x) <= CONFIG.cityHalfWidth &&
      (beach || dock) &&
      (!canal || bridgeDeck);
  }

  isNavigableWater(x, z) {
    return Math.abs(x) <= CONFIG.cityHalfWidth &&
      z >= coastlineAt(x) - 1 &&
      z <= coastlineAt(x) + CONFIG.oceanDepth;
  }
}

class MinHeap {
  constructor() { this.items = []; }
  get size() { return this.items.length; }
  push(value) {
    const items = this.items;
    items.push(value);
    let index = items.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (items[parent].priority <= value.priority) break;
      items[index] = items[parent];
      index = parent;
    }
    items[index] = value;
  }
  pop() {
    const items = this.items;
    if (items.length === 0) return null;
    const first = items[0];
    const last = items.pop();
    if (items.length) {
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        const right = left + 1;
        if (left >= items.length) break;
        const child = right < items.length && items[right].priority < items[left].priority ? right : left;
        if (items[child].priority >= last.priority) break;
        items[index] = items[child];
        index = child;
      }
      items[index] = last;
    }
    return first;
  }
}

function manhattan(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
}
