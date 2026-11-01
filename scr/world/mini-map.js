import { CONFIG } from "../config.js";
import { coastlineAt } from "./road-network.js";
import { LANDMARKS } from "./landmarks.js";

export class MiniMap {
  constructor(canvas, roads, fullCanvas = null) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.roads = roads;
    this.size = canvas.width;
    this.range = 420;
    this.scale = this.size / (this.range * 2);
    this.fullCanvas = fullCanvas;
    this.fullContext = fullCanvas?.getContext("2d") ?? null;
    this.waypoint = null;
    this.route = [];
    this.routeStartKey = null;
  }

  update(position, heading) {
    if (this.waypoint) {
      const routeKey = Math.round(position.x / CONFIG.blockSize) + ":" + Math.round(position.z / CONFIG.blockSize);
      if (routeKey !== this.routeStartKey) {
        this.routeStartKey = routeKey;
        this.route = this.routeForWaypoint(position);
      }
    }
    const context = this.context;
    const center = this.size * 0.5;
    const centerGridX = Math.floor(position.x / CONFIG.blockSize);
    const centerGridZ = Math.floor(position.z / CONFIG.blockSize);
    const gridRadius = Math.ceil(this.range / CONFIG.blockSize) + 1;

    context.clearRect(0, 0, this.size, this.size);
    context.save();
    context.beginPath();
    context.arc(center, center, center - 2, 0, Math.PI * 2);
    context.clip();
    context.fillStyle = "#1c302f";
    context.fillRect(0, 0, this.size, this.size);
    this.drawCoastline(position);

    for (let gridZ = centerGridZ - gridRadius; gridZ <= centerGridZ + gridRadius; gridZ += 1) {
      for (let gridX = centerGridX - gridRadius; gridX <= centerGridX + gridRadius; gridX += 1) {
        this.drawRoad(this.roads.getEdge("horizontal", gridX, gridZ), position);
        this.drawRoad(this.roads.getEdge("vertical", gridX, gridZ), position);
      }
    }
    this.drawMountainRoad(position);

    if (this.route.length > 1) this.drawRoute(context, this.route, position, this.scale, center);
    for (const landmark of LANDMARKS) this.drawLandmark(context, landmark, position, center);

    context.fillStyle = "rgba(245, 183, 123, 0.18)";
    context.beginPath();
    context.arc(center, center, 17, 0, Math.PI * 2);
    context.fill();
    context.translate(center, center);
    context.rotate(heading);
    context.fillStyle = "#f5b77b";
    context.strokeStyle = "#17262b";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(0, -10);
    context.lineTo(7, 8);
    context.lineTo(0, 5);
    context.lineTo(-7, 8);
    context.closePath();
    context.fill();
    context.stroke();
    context.restore();

    context.strokeStyle = "rgba(245, 241, 232, 0.48)";
    context.lineWidth = 1;
    context.beginPath();
    context.arc(center, center, center - 2, 0, Math.PI * 2);
    context.stroke();
    context.fillStyle = "rgba(245, 241, 232, 0.68)";
    context.font = "9px Consolas, monospace";
    context.textAlign = "center";
    context.fillText("N", center, 15);
  }

  setWaypoint(landmark, position) {
    this.waypoint = landmark;
    this.routeStartKey = Math.round(position.x / CONFIG.blockSize) + ":" + Math.round(position.z / CONFIG.blockSize);
    this.route = landmark ? this.routeForWaypoint(position) : [];
  }

  routeForWaypoint(position) {
    if (this.waypoint?.id !== "trail" || !this.roads.mountainRoadSegments?.length) {
      return this.roads.findRoute(position.x, position.z, this.waypoint.x, this.waypoint.z);
    }

    const segments = this.roads.mountainRoadSegments;
    let nearestStartIndex = 0;
    let nearestStartDistanceSquared = Infinity;
    let nearestStartPoint = null;
    let nearestTargetIndex = segments.length - 1;
    let nearestTargetDistanceSquared = Infinity;

    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index];
      const dx = segment.end.x - segment.start.x;
      const dz = segment.end.z - segment.start.z;
      const lengthSquared = dx * dx + dz * dz;
      const progress = Math.max(0, Math.min(1,
        ((position.x - segment.start.x) * dx + (position.z - segment.start.z) * dz) / lengthSquared
      ));
      const x = segment.start.x + dx * progress;
      const z = segment.start.z + dz * progress;
      const distanceSquared = (position.x - x) ** 2 + (position.z - z) ** 2;
      if (distanceSquared < nearestStartDistanceSquared) {
        nearestStartDistanceSquared = distanceSquared;
        nearestStartIndex = index;
        nearestStartPoint = { x, z };
      }

      const targetProgress = Math.max(0, Math.min(1,
        ((this.waypoint.x - segment.start.x) * dx + (this.waypoint.z - segment.start.z) * dz) / lengthSquared
      ));
      const targetX = segment.start.x + dx * targetProgress;
      const targetZ = segment.start.z + dz * targetProgress;
      const targetDistanceSquared = (this.waypoint.x - targetX) ** 2 + (this.waypoint.z - targetZ) ** 2;
      if (targetDistanceSquared < nearestTargetDistanceSquared) {
        nearestTargetDistanceSquared = targetDistanceSquared;
        nearestTargetIndex = index;
      }
    }

    const onMountainRoad = nearestStartDistanceSquared < 520 * 520;
    const startIndex = onMountainRoad ? nearestStartIndex : 0;
    const startPoint = onMountainRoad ? nearestStartPoint : segments[0].start;
    const route = onMountainRoad
      ? [{ x: position.x, z: position.z }, startPoint]
      : this.roads.findRoute(position.x, position.z, startPoint.x, startPoint.z);

    for (let index = startIndex; index <= nearestTargetIndex; index += 1) {
      const end = segments[index].end;
      route.push({ x: end.x, z: end.z });
    }
    return route;
  }

  drawFullMap(position) {
    if (!this.fullContext) return;
    const context = this.fullContext;
    const width = this.fullCanvas.width;
    const height = this.fullCanvas.height;
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#30433e";
    context.fillRect(0, 0, width, height);
    context.fillStyle = "#1d4d61";
    context.beginPath();
    const coastPoints = [];
    for (let index = 0; index <= 80; index += 1) {
      const worldX = -5600 + index / 80 * 11200;
      coastPoints.push({ x: this.fullX(worldX, width), y: this.fullY(coastlineAt(worldX), height) });
    }
    context.moveTo(coastPoints[0].x, 0);
    context.lineTo(coastPoints[0].x, coastPoints[0].y);
    for (const point of coastPoints.slice(1)) context.lineTo(point.x, point.y);
    context.lineTo(coastPoints.at(-1).x, 0);
    context.closePath();
    context.fill();
    context.strokeStyle = "rgba(231, 205, 158, 0.75)";
    context.lineWidth = 1.4;
    context.beginPath();
    coastPoints.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y));
    context.stroke();

    for (let gridZ = -17; gridZ <= 9; gridZ += 1) {
      for (let gridX = -21; gridX <= 20; gridX += 1) {
        this.drawFullRoad(context, this.roads.getEdge("horizontal", gridX, gridZ), width, height);
        this.drawFullRoad(context, this.roads.getEdge("vertical", gridX, gridZ), width, height);
      }
    }
    this.drawFullMountainRoad(context, width, height);
    if (this.route.length > 1) this.drawRoute(context, this.route, null, 1, 0, width, height);
    for (const landmark of LANDMARKS) {
      const x = this.fullX(landmark.x, width);
      const y = this.fullY(landmark.z, height);
      context.fillStyle = landmark === this.waypoint ? "#ffe0a8" : "#f5b77b";
      context.strokeStyle = "#17262b";
      context.lineWidth = 2;
      context.beginPath();
      context.arc(x, y, landmark === this.waypoint ? 7 : 5, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      context.fillStyle = "#f5f1e8";
      context.font = "10px Consolas, monospace";
      context.fillText(landmark.name.toUpperCase(), x + 9, y - 7);
    }
    const playerX = this.fullX(position.x, width);
    const playerY = this.fullY(position.z, height);
    context.fillStyle = "#ffffff";
    context.strokeStyle = "#152229";
    context.lineWidth = 3;
    context.beginPath();
    context.arc(playerX, playerY, 6, 0, Math.PI * 2);
    context.fill();
    context.stroke();
  }

  drawFullRoad(context, edge, width, height) {
    if (!edge) return;
    context.strokeStyle = edge.isFreeway ? "#d58a55" : edge.isMountainRoad ? "#998b6d" : edge.isBridge ? "#72aeb5" : edge.isAvenue ? "#788585" : "#52645e";
    context.lineWidth = Math.max(1, edge.width * width / 11200);
    context.beginPath();
    context.moveTo(this.fullX(edge.startX, width), this.fullY(edge.startZ, height));
    context.lineTo(this.fullX(edge.endX, width), this.fullY(edge.endZ, height));
    context.stroke();
  }

  drawFullMountainRoad(context, width, height) {
    context.beginPath();
    context.strokeStyle = "#a89a79";
    context.lineWidth = Math.max(1, 14 * width / 11200);
    context.lineCap = "round";
    for (const segment of this.roads.mountainRoadSegments ?? []) {
      context.moveTo(this.fullX(segment.start.x, width), this.fullY(segment.start.z, height));
      context.lineTo(this.fullX(segment.end.x, width), this.fullY(segment.end.z, height));
    }
    context.stroke();
  }

  drawRoute(context, route, position, scale, center, width = null, height = null) {
    context.save();
    context.strokeStyle = "#f6d77a";
    context.lineWidth = width ? 3 : 2.6;
    context.setLineDash([7, 5]);
    context.beginPath();
    route.forEach((point, index) => {
      const x = width ? this.fullX(point.x, width) : this.toMapX(point.x, position.x);
      const y = width ? this.fullY(point.z, height) : this.toMapY(point.z, position.z);
      index ? context.lineTo(x, y) : context.moveTo(x, y);
    });
    context.stroke();
    context.restore();
  }

  drawLandmark(context, landmark, position, center) {
    const dx = (landmark.x - position.x) * this.scale;
    const dy = -(landmark.z - position.z) * this.scale;
    if (Math.abs(dx) > this.range * this.scale || Math.abs(dy) > this.range * this.scale) return;
    context.fillStyle = landmark === this.waypoint ? "#ffe0a8" : "#f5b77b";
    context.strokeStyle = "#18272b";
    context.lineWidth = 2;
    context.beginPath();
    context.arc(center + dx, center + dy, 3.2, 0, Math.PI * 2);
    context.fill();
    context.stroke();
  }

  fullX(worldX, width) { return (worldX + 5600) / 11200 * width; }
  fullY(worldZ, height) { return height - (worldZ + 4400) / 6600 * height; }

  drawRoad(edge, playerPosition) {
    if (!edge) {
      return;
    }

    const startX = this.toMapX(edge.startX, playerPosition.x);
    const startY = this.toMapY(edge.startZ, playerPosition.z);
    const endX = this.toMapX(edge.endX, playerPosition.x);
    const endY = this.toMapY(edge.endZ, playerPosition.z);
    const context = this.context;

    context.lineCap = "round";
    context.lineWidth = Math.max(2, edge.width * this.scale);
    context.strokeStyle = edge.isFreeway
      ? "#d58a55"
      : edge.isMountainRoad
        ? "#a49573"
        : edge.isBridge
          ? "#72aeb5"
          : edge.isAvenue
            ? "#687277"
            : "#49565b";
    context.beginPath();
    context.moveTo(startX, startY);
    context.lineTo(endX, endY);
    context.stroke();
  }

  drawMountainRoad(playerPosition) {
    const maxRange = this.range + this.roads.mountainRoadWidth;
    const context = this.context;
    context.beginPath();
    context.lineCap = "round";
    context.lineWidth = Math.max(1.2, this.roads.mountainRoadWidth * this.scale);
    context.strokeStyle = "#a89a79";
    for (const segment of this.roads.mountainRoadSegments ?? []) {
      const midpointX = (segment.start.x + segment.end.x) * 0.5;
      const midpointZ = (segment.start.z + segment.end.z) * 0.5;
      if (Math.abs(midpointX - playerPosition.x) > maxRange ||
          Math.abs(midpointZ - playerPosition.z) > maxRange) continue;
      context.moveTo(this.toMapX(segment.start.x, playerPosition.x), this.toMapY(segment.start.z, playerPosition.z));
      context.lineTo(this.toMapX(segment.end.x, playerPosition.x), this.toMapY(segment.end.z, playerPosition.z));
    }
    context.stroke();
  }

  drawCoastline(playerPosition) {
    const context = this.context;
    const samples = 32;
    const points = [];

    for (let index = 0; index <= samples; index += 1) {
      const mapX = (index / samples) * this.size;
      const worldX = playerPosition.x + (mapX - this.size * 0.5) / this.scale;
      points.push({
        x: mapX,
        y: this.toMapY(coastlineAt(worldX), playerPosition.z)
      });
    }

    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo(points[0].x, points[0].y);

    for (const point of points.slice(1)) {
      context.lineTo(point.x, point.y);
    }

    context.lineTo(this.size, 0);
    context.closePath();
    context.fillStyle = "#24586b";
    context.fill();
    context.strokeStyle = "rgba(232, 204, 157, 0.8)";
    context.lineWidth = 2;
    context.beginPath();

    for (const [index, point] of points.entries()) {
      if (index === 0) {
        context.moveTo(point.x, point.y);
      } else {
        context.lineTo(point.x, point.y);
      }
    }

    context.stroke();
  }

  toMapX(worldX, playerX) {
    return this.size * 0.5 + (worldX - playerX) * this.scale;
  }

  toMapY(worldZ, playerZ) {
    return this.size * 0.5 - (worldZ - playerZ) * this.scale;
  }
}
