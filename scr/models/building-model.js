import * as THREE from "three";
import { seededRandom } from "../core/random.js";
import { addBox } from "./catalog.js";

const WINDOW_SALT = 0x192ad5b7;
const ENTERABLE_STYLES = new Set(["shop", "restaurant", "hotel", "entertainment", "civic"]);

export function createBuilding(group, catalog, seed, cellX, cellZ, lotIndex, x, z, district = "mixed") {
  const random = seededRandom(seed, cellX * 5 + lotIndex, cellZ * 7 - lotIndex, WINDOW_SALT);
  const archetype = chooseArchetype(random, district);
  const isLargeFootprint = archetype === "warehouse" || archetype === "entertainment";
  const width = isLargeFootprint ? 72 + random() * 38 : 36 + random() * 24;
  const depth = isLargeFootprint ? 62 + random() * 34 : 36 + random() * 24;
  const floors = floorsFor(archetype, random);
  const floorHeight = archetype === "tower" ? 3.25 + random() * 0.25 : 3.45 + random() * 0.35;
  const height = floors * floorHeight;
  const materialIndex = Math.floor(random() * catalog.materials.buildings.length);
  const facade = archetype === "tower"
    ? catalog.materials.buildingGlass
    : archetype === "deco"
      ? catalog.materials.deco
      : archetype === "warehouse"
        ? catalog.materials.stone
        : archetype === "civic"
          ? catalog.materials.stone
        : archetype === "entertainment"
          ? catalog.materials.marquee
          : catalog.materials.buildings[materialIndex];
  const style = archetype === "tower" ? 0 : archetype === "deco" ? 1 : 2;
  const baseY = height * 0.5;

  addBox(group, catalog, facade, { x, y: baseY, z }, { x: width, y: height, z: depth }, true);
  addRoof(group, catalog, random, archetype, x, z, width, depth, height);
  addFacadeDetails(group, catalog, random, x, z, width, depth, floors, floorHeight, style, archetype);
  addArchetypeDetails(group, catalog, random, archetype, x, z, width, depth, floors, floorHeight, height);

  const isEnterable = ENTERABLE_STYLES.has(archetype);
  const doorZ = z - depth * 0.5 - 0.16;

  if (isEnterable) {
    addEntrance(group, catalog, x, doorZ, archetype);
  }

  return {
    minX: x - width * 0.5 - 1.5,
    maxX: x + width * 0.5 + 1.5,
    minZ: z - depth * 0.5 - 1.5,
    maxZ: z + depth * 0.5 + 1.5,
    archetype,
    interior: isEnterable
      ? {
          name: interiorName(archetype),
          archetype,
          x,
          z,
          doorX: x,
          doorZ: doorZ - 2.3,
          heading: 0
        }
      : null
  };
}

function chooseArchetype(random, district) {
  const rolls = {
    downtown: [["tower", 0.38], ["deco", 0.3], ["shop", 0.18], ["civic", 0.14]],
    coast: [["hotel", 0.26], ["entertainment", 0.14], ["shop", 0.22], ["restaurant", 0.12], ["mediterranean", 0.12], ["civic", 0.14]],
    hillside: [["hillside", 0.62], ["mediterranean", 0.2], ["house", 0.18]],
    suburban: [["house", 0.72], ["mediterranean", 0.18], ["shop", 0.1]],
    industrial: [["warehouse", 0.67], ["shop", 0.16], ["civic", 0.08], ["deco", 0.09]],
    mixed: [["shop", 0.24], ["restaurant", 0.12], ["mediterranean", 0.24], ["deco", 0.16], ["warehouse", 0.1], ["house", 0.14]]
  };
  const options = rolls[district] ?? rolls.mixed;
  const value = random();
  let cumulative = 0;

  for (const [type, probability] of options) {
    cumulative += probability;
    if (value <= cumulative) return type;
  }

  return options[options.length - 1][0];
}

function floorsFor(archetype, random) {
  if (archetype === "tower") return 14 + Math.floor(random() * 15);
  if (archetype === "deco") return 7 + Math.floor(random() * 10);
  if (archetype === "hotel") return 8 + Math.floor(random() * 11);
  if (archetype === "entertainment") return 2 + Math.floor(random() * 4);
  if (archetype === "restaurant") return 1 + Math.floor(random() * 2);
  if (archetype === "civic") return 2 + Math.floor(random() * 4);
  if (archetype === "warehouse") return 1 + Math.floor(random() * 2);
  if (archetype === "house" || archetype === "hillside") return 1 + Math.floor(random() * 2);
  if (archetype === "mediterranean") return 2 + Math.floor(random() * 2);
  return 1 + Math.floor(random() * 3);
}

function addRoof(group, catalog, random, archetype, x, z, width, depth, height) {
  if (["house", "hillside", "mediterranean"].includes(archetype)) {
    const roof = new THREE.Mesh(catalog.geometries.mountain, catalog.materials.terracotta);
    roof.position.set(x, height + 2.2, z);
    roof.scale.set(width * 0.64, 4.6, depth * 0.68);
    roof.rotation.y = Math.PI * 0.25;
    roof.castShadow = true;
    roof.receiveShadow = true;
    group.add(roof);
    return;
  }

  addBox(
    group,
    catalog,
    archetype === "deco" ? catalog.materials.deco : catalog.materials.roof,
    { x, y: height + 0.18, z },
    { x: width + 1.2, y: 0.36, z: depth + 1.2 },
    false
  );

  if (archetype === "tower" || archetype === "hotel") {
    const tiers = archetype === "tower" ? 3 : 1;
    for (let tier = 0; tier < tiers; tier += 1) {
      const inset = (tier + 1) * (archetype === "tower" ? 2.8 : 1.4);
      const tierHeight = archetype === "tower" ? height - 4 - tier * 3.4 : height + 1.4;
      addBox(
        group,
        catalog,
        catalog.materials.roof,
        { x, y: tierHeight, z },
        { x: Math.max(12, width - inset * 2), y: 2.2, z: Math.max(12, depth - inset * 2) },
        true
      );
    }
  } else if (archetype === "warehouse") {
    for (let ridge = -1; ridge <= 1; ridge += 1) {
      addBox(
        group,
        catalog,
        catalog.materials.trim,
        { x: x + ridge * width * 0.22, y: height + 0.62, z },
        { x: 0.28, y: 0.58, z: depth * 0.92 },
        false
      );
    }
  } else if (archetype === "deco" && random() > 0.25) {
    addBox(group, catalog, catalog.materials.deco, { x, y: height + 1.1, z }, { x: 9, y: 1.5, z: 8 });
  }
}

function addFacadeDetails(group, catalog, random, x, z, width, depth, floors, floorHeight, style, archetype) {
  const windowMaterial = archetype === "tower"
    ? catalog.materials.buildingGlass
    : archetype === "warehouse"
      ? catalog.materials.trim
      : style === 0
        ? catalog.materials.buildingGlass
        : catalog.materials.window;
  const colsX = Math.max(2, Math.floor(width / (archetype === "house" ? 13 : 10)));
  const colsZ = Math.max(2, Math.floor(depth / 10));
  const windowInstances = new THREE.InstancedMesh(
    catalog.geometries.box,
    windowMaterial,
    floors * 2 * (colsX + colsZ)
  );
  const transform = new THREE.Object3D();
  let count = 0;
  const facadeDepth = depth * 0.5 + 0.025;
  const facadeWidth = width * 0.5 + 0.025;
  const windowWidth = archetype === "warehouse" ? 1.8 : style === 2 ? 1.35 : 1.7;
  const windowHeight = archetype === "house" ? 1.15 : style === 1 ? 1.5 : 1.85;
  const visibleFloors = archetype === "warehouse" ? [floors - 1] : Array.from({ length: floors }, (_, floor) => floor);

  for (const floor of visibleFloors) {
    const levelY = floor * floorHeight + floorHeight * 0.57;

    for (let column = 0; column < colsX; column += 1) {
      const sideX = -width * 0.5 + width * (column + 0.5) / colsX;
      placeWindow(transform, windowInstances, count++, x + sideX, levelY, z - facadeDepth, 0, windowWidth, windowHeight);
      placeWindow(transform, windowInstances, count++, x + sideX, levelY, z + facadeDepth, 0, windowWidth, windowHeight);
    }

    for (let column = 0; column < colsZ; column += 1) {
      const sideZ = -depth * 0.5 + depth * (column + 0.5) / colsZ;
      placeWindow(transform, windowInstances, count++, x - facadeWidth, levelY, z + sideZ, Math.PI * 0.5, windowWidth, windowHeight);
      placeWindow(transform, windowInstances, count++, x + facadeWidth, levelY, z + sideZ, Math.PI * 0.5, windowWidth, windowHeight);
    }
  }

  windowInstances.count = count;
  windowInstances.instanceMatrix.needsUpdate = true;
  windowInstances.castShadow = false;
  windowInstances.receiveShadow = true;
  group.add(windowInstances);

  if (["deco", "hotel", "civic", "entertainment"].includes(archetype)) {
    const bands = [];
    for (let floor = 1; floor < floors; floor += 1) {
      bands.push({
        position: { x, y: floor * floorHeight, z: z - facadeDepth },
        scale: { x: width * 1.02, y: 0.18, z: 0.28 }
      });
    }
    addBoxInstances(group, catalog.geometries.box,
      archetype === "deco" ? catalog.materials.deco : catalog.materials.trim, bands);
  }

  if (archetype === "deco") {
    const columns = [];
    for (let column = -1; column <= 1; column += 1) {
      columns.push({
        position: { x: x + column * width * 0.25, y: floorHeight * 0.5, z: z - facadeDepth - 0.08 },
        scale: { x: 0.46, y: floorHeight, z: 0.28 }
      });
    }
    addBoxInstances(group, catalog.geometries.box, catalog.materials.deco, columns);
  }

  if (random() > 0.52 && !["warehouse", "house"].includes(archetype)) {
    addBox(
      group,
      catalog,
      catalog.materials.trim,
      { x, y: floorHeight * 0.44, z: z - facadeDepth - 0.03 },
      { x: width * 0.19, y: 1.4, z: 0.08 },
      false
    );
  }
}

function addArchetypeDetails(group, catalog, random, archetype, x, z, width, depth, floors, floorHeight, height) {
  const frontZ = z - depth * 0.5 - 0.2;

  if (archetype === "house" || archetype === "hillside" || archetype === "mediterranean") {
    if (archetype !== "house" || random() > 0.4) {
      addBox(group, catalog, catalog.materials.trim, { x, y: 1.7, z: frontZ - 1.1 }, { x: width * 0.42, y: 0.2, z: 2.2 }, false);
      for (const side of [-1, 1]) {
        addBox(group, catalog, catalog.materials.trim, { x: x + side * width * 0.17, y: 1.95, z: frontZ - 1.1 }, { x: 0.18, y: 0.7, z: 0.18 }, false);
      }
    }

    if (archetype === "hillside") {
      addBox(
        group,
        catalog,
        catalog.materials.stone,
        { x, y: 1.5, z: z + depth * 0.5 + 2.1 },
        { x: width + 9, y: 3, z: 1.6 },
        false
      );

      for (let step = 0; step < 4; step += 1) {
        addBox(
          group,
          catalog,
          catalog.materials.stone,
          { x, y: 0.24 + step * 0.28, z: frontZ - 1.2 - step * 1.15 },
          { x: width * 0.28, y: 0.48, z: 1.25 },
          false
        );
      }
    }
    return;
  }

  if (archetype === "warehouse") {
    const bays = Math.max(2, Math.floor(width / 25));
    const doors = [];
    const headers = [];
    for (let bay = 0; bay < bays; bay += 1) {
      const doorX = x - width * 0.38 + bay * (width * 0.76 / Math.max(1, bays - 1));
      doors.push({ position: { x: doorX, y: 2.1, z: frontZ }, scale: { x: 9, y: 3.7, z: 0.16 } });
      headers.push({ position: { x: doorX, y: 4.15, z: frontZ - 0.08 }, scale: { x: 10, y: 0.24, z: 0.22 } });
    }
    addBoxInstances(group, catalog.geometries.box, catalog.materials.warehouseDoor, doors);
    addBoxInstances(group, catalog.geometries.box, catalog.materials.trim, headers);
    return;
  }

  if (archetype === "shop" || archetype === "restaurant") {
    const awningMaterial = archetype === "restaurant"
      ? catalog.materials.marquee
      : catalog.materials.awning;
    addBox(group, catalog, awningMaterial, { x, y: 3.5, z: frontZ - 1.1 }, { x: width * 0.72, y: 0.5, z: 2.2 }, false);
    addBox(group, catalog, catalog.materials.trim, { x, y: 0.16, z: frontZ - 1.25 }, { x: width * 0.78, y: 0.32, z: 2.5 }, false);

    if (archetype === "restaurant") {
      for (const side of [-1, 1]) {
        const table = new THREE.Mesh(catalog.geometries.cylinder, catalog.materials.trim);
        table.position.set(x + side * width * 0.34, 0.85, frontZ - 3.2);
        table.scale.set(0.85, 0.16, 0.85);
        group.add(table);
      }
    }
    return;
  }

  if (archetype === "entertainment") {
    addBox(group, catalog, catalog.materials.marquee, { x, y: height + 1.25, z: frontZ - 0.4 }, { x: width * 0.78, y: 1.9, z: 0.42 }, false);
    addBox(group, catalog, catalog.materials.deco, { x, y: 3.2, z: frontZ - 1.4 }, { x: width * 0.3, y: 3.1, z: 2.4 }, false);
    return;
  }

  if (archetype === "hotel") {
    const balconies = [];
    for (let floor = 1; floor < floors; floor += 2) {
      balconies.push({
        position: { x, y: floor * floorHeight + 0.08, z: frontZ - 1.25 },
        scale: { x: width * 0.82, y: 0.2, z: 2.1 }
      });
    }
    addBoxInstances(group, catalog.geometries.box, catalog.materials.bridge, balconies);
  }

  if (archetype === "civic") {
    const columns = 5;
    const pillars = [];
    for (let column = 0; column < columns; column += 1) {
      const columnX = x - width * 0.34 + column * (width * 0.68 / (columns - 1));
      pillars.push({
        position: { x: columnX, y: floorHeight * 0.74, z: frontZ - 0.45 },
        scale: { x: 0.42, y: floorHeight * 1.45, z: 0.42 }
      });
    }
    addBoxInstances(group, catalog.geometries.cylinder, catalog.materials.stone, pillars);
    addBox(group, catalog, catalog.materials.stone, { x, y: floorHeight * 1.55, z: frontZ - 0.55 }, { x: width * 0.9, y: 0.48, z: 1.1 }, false);
    addBox(group, catalog, catalog.materials.stone, { x, y: 0.3, z: frontZ - 2.2 }, { x: width * 0.58, y: 0.45, z: 3.2 }, false);
  }
}

function addEntrance(group, catalog, x, doorZ, archetype) {
  const door = new THREE.Mesh(catalog.geometries.box, catalog.materials.trim);
  door.position.set(x, 1.18, doorZ - 0.03);
  door.scale.set(archetype === "hotel" ? 2.6 : 2.05, 2.35, 0.12);
  door.castShadow = false;
  group.add(door);

  for (const side of [-1, 1]) {
    addBox(group, catalog, catalog.materials.stone, { x: x + side * (archetype === "hotel" ? 1.55 : 1.25), y: 1.25, z: doorZ - 0.08 }, { x: 0.26, y: 2.65, z: 0.3 }, false);
  }

  addBox(group, catalog, catalog.materials.deco, { x, y: 2.65, z: doorZ - 0.08 }, { x: 3.2, y: 0.3, z: 0.32 }, false);
}

function interiorName(archetype) {
  if (archetype === "shop") return "SUNSHORE MARKET";
  if (archetype === "restaurant") return "BAYVIEW DINER";
  if (archetype === "hotel") return "COASTLINE HOTEL LOBBY";
  if (archetype === "entertainment") return "SUNSHORE PAVILION";
  return "CITY HALL FOYER";
}

function placeWindow(transform, instances, index, x, y, z, rotationY, width, height) {
  transform.position.set(x, y, z);
  transform.rotation.set(0, rotationY, 0);
  transform.scale.set(width, height, 0.08);
  transform.updateMatrix();
  instances.setMatrixAt(index, transform.matrix);
}

function addBoxInstances(group, geometry, material, items) {
  if (items.length === 0) return;

  const instances = new THREE.InstancedMesh(geometry, material, items.length);
  const transform = new THREE.Object3D();

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    transform.position.set(item.position.x, item.position.y, item.position.z);
    transform.rotation.set(0, item.rotationY ?? 0, 0);
    transform.scale.set(item.scale.x, item.scale.y, item.scale.z);
    transform.updateMatrix();
    instances.setMatrixAt(index, transform.matrix);
  }

  instances.instanceMatrix.needsUpdate = true;
  instances.castShadow = false;
  instances.receiveShadow = true;
  group.add(instances);
}
