import * as THREE from "three";
import { createVehicleModel } from "../models/vehicle-models.js";
import { coastlineAt } from "../world/road-network.js";

export class BoatSystem {
  constructor(scene, catalog) {
    this.scene = scene;
    this.boats = [];
    this.vehicles = [];
    for (let index = 0; index < 6; index += 1) {
      const model = createVehicleModel("boat", catalog, index + 1);
      model.rotation.y = Math.PI * 0.5;
      this.scene.add(model);
      const boat = {
        group: model,
        type: "boat",
        baseX: 2180 + index * 172,
        phase: index * 1.7,
        speed: 0,
        cruiseSpeed: 16 + index,
        parked: index < 2,
        controlled: false,
        condition: 100
      };
      if (index < 2) {
        const dockX = index === 0 ? 2400 : 2760;
        boat.group.position.set(dockX + 8.8, -0.02, coastlineAt(dockX) + 106);
        boat.group.rotation.y = index === 0 ? Math.PI : 0;
      }
      this.boats.push({ vehicle: boat, speed: index % 2 === 0 ? 12 + index : -10 - index * 0.7 });
      this.vehicles.push(boat);
    }
  }

  update(deltaSeconds, elapsed) {
    for (const item of this.boats) {
      const boat = item.vehicle;
      if (boat.parked || boat.controlled) continue;
      const x = 2180 + (this.boats.indexOf(item) * 172) + Math.sin(elapsed * 0.035 + boat.phase) * 115 + item.speed * elapsed * 0.12;
      const wrappedX = 2140 + ((x - 2140) % 1100 + 1100) % 1100;
      const coast = coastlineAt(wrappedX);
      boat.group.position.set(
        wrappedX,
        -0.02 + Math.sin(elapsed * 1.2 + boat.phase) * 0.08,
        coast + 94 + Math.sin(elapsed * 0.09 + boat.phase) * 116
      );
      boat.group.rotation.y = (item.speed > 0 ? Math.PI * 0.5 : -Math.PI * 0.5) + Math.sin(elapsed * 0.05 + boat.phase) * 0.09;
    }
  }

  findNearestAvailable(position, maximumDistance = 9) {
    let nearest = null;
    let nearestDistance = maximumDistance * maximumDistance;
    for (const boat of this.vehicles) {
      if (!boat.group.visible || boat.controlled || boat.stored) continue;
      const dx = position.x - boat.group.position.x;
      const dz = position.z - boat.group.position.z;
      const distance = dx * dx + dz * dz;
      if (distance < nearestDistance) {
        nearest = boat;
        nearestDistance = distance;
      }
    }
    return nearest;
  }

  setWorldVisible(visible) {
    for (const boat of this.vehicles) {
      if (!visible) {
        boat.visibleBeforeInterior = boat.group.visible;
        boat.group.visible = false;
      } else if (boat.visibleBeforeInterior !== undefined) {
        boat.group.visible = boat.visibleBeforeInterior;
        delete boat.visibleBeforeInterior;
      }
    }
  }
}
