import * as THREE from "three";
import { addBox, addCylinder } from "./catalog.js";
import { cloneImportedVehicle } from "./imported-vehicles.js";

export function createVehicleModel(kind, catalog, colorIndex) {
  const importedModel = catalog.vehicleModels?.get(kind);
  if (importedModel) {
    const imported = new THREE.Group();
    imported.add(cloneImportedVehicle(importedModel));
    imported.scale.setScalar(1.3);
    imported.userData.vehicleKind = kind;
    imported.userData.headlights = [];
    imported.userData.setCondition = () => {};
    return imported;
  }

  const group = new THREE.Group();
  const paint = catalog.materials.vehicles[colorIndex % catalog.materials.vehicles.length];

  if (kind === "boat") {
    buildBoat(group, catalog, paint);
  } else if (["bike", "motorcycle", "scooter", "bicycle"].includes(kind)) {
    buildMotorcycle(group, catalog, paint, kind);
  } else if (["truck", "pickup"].includes(kind)) {
    buildTruck(group, catalog, paint);
  } else if (kind === "bus") {
    buildBus(group, catalog, paint);
  } else {
    const vanLike = ["van", "delivery", "service"].includes(kind);
    buildCar(group, catalog, paint, vanLike, kind);
    if (kind === "taxi") addTaxiSign(group, catalog);
    if (["police", "ambulance", "fire"].includes(kind)) addEmergencyLights(group, catalog, kind);
  }

  const headlights = [];
  group.traverse((object) => {
    if (object.isMesh && object.material === catalog.materials.headlight) headlights.push(object);
  });
  const damageMarks = [];
  const isBike = ["bike", "motorcycle", "scooter", "bicycle"].includes(kind);
  const markZ = kind === "bus" ? 4.32 : kind === "truck" || kind === "pickup" ? 2.85 : isBike ? 0.9 : 1.92;
  const markX = isBike ? 0.28 : 0.88;
  for (const side of [-1, 1]) {
    const mark = addBox(group, catalog, catalog.materials.damage,
      { x: side * markX, y: 0.72, z: markZ },
      { x: 0.12, y: 0.28, z: 0.12 }, false);
    mark.visible = false;
    damageMarks.push(mark);
  }

  group.traverse((object) => {
    if (object.isMesh) {
      object.castShadow =
        object.material === paint ||
        object.material === catalog.materials.tire;
      object.receiveShadow = true;
    }
  });

  group.userData.vehicleKind = kind;
  group.userData.headlights = headlights;
  group.userData.setCondition = (condition) => {
    damageMarks.forEach((mark, index) => { mark.visible = condition < 76 - index * 20; });
  };
  return group;
}

export function createTrafficVehicleModel(kind, catalog, colorIndex) {
  const group = new THREE.Group();
  const paint = catalog.materials.vehicles[colorIndex % catalog.materials.vehicles.length];
  const dark = catalog.materials.tire;
  const glass = catalog.materials.glass;
  const bike = ["bike", "motorcycle", "scooter", "bicycle"].includes(kind);
  const truck = kind === "truck" || kind === "pickup";

  if (bike) {
    for (const z of [-1.08, 1.08]) {
      const wheel = new THREE.Mesh(catalog.geometries.wheel, dark);
      wheel.position.set(0, 0.48, z);
      wheel.rotation.z = Math.PI * 0.5;
      wheel.scale.setScalar(kind === "bicycle" ? 1.05 : 0.82);
      wheel.castShadow = false;
      wheel.receiveShadow = false;
      group.add(wheel);
    }
    addTrafficBox(group, catalog, paint, { x: 0, y: 0.91, z: 0 }, { x: 0.24, y: 0.3, z: 1.75 });
    addTrafficBox(group, catalog, kind === "bicycle" ? dark : paint, { x: 0, y: 1.16, z: -0.18 }, { x: 0.48, y: 0.2, z: 0.72 });
    addTrafficBox(group, catalog, dark, { x: 0, y: 1.38, z: 0.79 }, { x: 0.82, y: 0.08, z: 0.08 });
  } else if (truck) {
    addTrafficBox(group, catalog, dark, { x: 0, y: 0.48, z: -0.06 }, { x: 2.48, y: 0.32, z: 5.1 });
    addTrafficBox(group, catalog, paint, { x: 0, y: 1.28, z: -1.07 }, { x: 2.25, y: 1.55, z: 3.05 });
    addTrafficBox(group, catalog, paint, { x: 0, y: 1.34, z: 1.48 }, { x: 1.9, y: 1.46, z: 1.9 });
    addTrafficBox(group, catalog, glass, { x: 0, y: 1.69, z: 2.47 }, { x: 1.55, y: 0.66, z: 0.08 });
  } else if (kind === "bus") {
    addTrafficBox(group, catalog, dark, { x: 0, y: 0.48, z: 0 }, { x: 2.62, y: 0.32, z: 8.35 });
    addTrafficBox(group, catalog, paint, { x: 0, y: 1.72, z: 0 }, { x: 2.55, y: 2.42, z: 8.5 });
    addTrafficBox(group, catalog, glass, { x: 0, y: 2.16, z: 0 }, { x: 2.58, y: 1.02, z: 6.55 });
  } else {
    addTrafficBox(group, catalog, dark, { x: 0, y: 0.44, z: 0 }, { x: 1.95, y: 0.26, z: 3.65 });
    addTrafficBox(group, catalog, paint, { x: 0, y: 0.83, z: 0 }, { x: kind === "compact" ? 1.74 : 1.92, y: 0.58, z: kind === "compact" ? 3.8 : 4.45 });
    addTrafficBox(group, catalog, glass, { x: 0, y: 1.31, z: -0.16 }, { x: 1.52, y: 0.72, z: kind === "sports" ? 2.1 : 2.36 });
    addTrafficBox(group, catalog, paint, { x: 0, y: 1.69, z: -0.16 }, { x: 1.2, y: 0.12, z: 1.83 });
  }

  group.userData.vehicleKind = kind;
  group.userData.headlights = [];
  group.userData.emergencyLights = [];
  group.userData.setCondition = () => {};
  return group;
}

function addTrafficBox(group, catalog, material, position, scale) {
  const mesh = new THREE.Mesh(catalog.geometries.box, material);
  mesh.position.set(position.x, position.y, position.z);
  mesh.scale.set(scale.x, scale.y, scale.z);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  group.add(mesh);
  return mesh;
}

function buildCar(group, catalog, paint, isVan, kind = "car") {
  const sports = kind === "sports";
  const bodyLength = isVan ? 5.2 : sports ? 4.8 : kind === "compact" ? 3.8 : 4.4;
  const bodyWidth = isVan ? 1.85 : sports ? 1.94 : 1.82;
  const bodyHeight = isVan ? 1.35 : sports ? 0.76 : 0.85;
  const cabinHeight = isVan ? 1.35 : sports ? 0.82 : 1.08;
  const cabinLength = isVan ? 2.8 : sports ? 2.15 : kind === "compact" ? 2.05 : 2.35;
  const cabinY = bodyHeight + cabinHeight * 0.5 - 0.12;

  addBox(group, catalog, paint, { x: 0, y: 0.86, z: 0 }, { x: bodyWidth, y: bodyHeight, z: bodyLength });
  addBox(
    group,
    catalog,
    catalog.materials.glass,
    { x: 0, y: cabinY, z: isVan ? -0.05 : -0.22 },
    { x: bodyWidth * 0.84, y: cabinHeight, z: cabinLength }
  );
  addBox(
    group,
    catalog,
    paint,
    { x: 0, y: cabinY + cabinHeight * 0.5 + 0.08, z: isVan ? -0.05 : -0.22 },
    { x: bodyWidth * 0.88, y: 0.16, z: cabinLength + 0.16 }
  );

  for (const side of [-1, 1]) {
    const x = side * bodyWidth * 0.5;
    addBox(group, catalog, catalog.materials.trim, { x, y: 0.95, z: 0 }, { x: 0.1, y: 0.12, z: bodyLength * 0.67 }, false);
    addBox(group, catalog, catalog.materials.headlight, { x: side * 0.58, y: 0.9, z: bodyLength * 0.5 + 0.025 }, { x: 0.38, y: 0.23, z: 0.08 }, false);
    addBox(group, catalog, catalog.materials.taillight, { x: side * 0.58, y: 0.9, z: -bodyLength * 0.5 - 0.025 }, { x: 0.34, y: 0.2, z: 0.08 }, false);
  }

  addCarWheels(group, catalog, bodyWidth, bodyLength);

  if (sports) {
    addBox(group, catalog, catalog.materials.trim, { x: 0, y: 0.92, z: -bodyLength * 0.47 }, { x: bodyWidth * 0.84, y: 0.28, z: 0.16 }, false);
  }
}

function addTaxiSign(group, catalog) {
  addBox(group, catalog, catalog.materials.deco, { x: 0, y: 2.08, z: -0.18 }, { x: 0.72, y: 0.22, z: 0.42 }, false);
  addBox(group, catalog, catalog.materials.roadSignText, { x: 0, y: 2.2, z: -0.18 }, { x: 0.42, y: 0.035, z: 0.24 }, false);
}

function addEmergencyLights(group, catalog, kind) {
  const red = new THREE.MeshStandardMaterial({ color: 0xf24d43, emissive: 0xc21e18, emissiveIntensity: 1.2 });
  const blue = new THREE.MeshStandardMaterial({ color: 0x338dff, emissive: 0x1246c2, emissiveIntensity: 1.2 });
  const material = kind === "fire" ? red : null;
  for (const side of [-1, 1]) {
    const light = addBox(group, catalog, material ?? (side < 0 ? red : blue), { x: side * 0.31, y: 2.05, z: -0.18 }, { x: 0.32, y: 0.12, z: 0.28 }, false);
    group.userData.emergencyLights ??= [];
    light.userData.flashPhase = side * 0.8;
    group.userData.emergencyLights.push(light);
  }
}

function buildBus(group, catalog, paint) {
  addBox(group, catalog, paint, { x: 0, y: 1.75, z: 0 }, { x: 2.55, y: 2.85, z: 8.6 });
  addBox(group, catalog, catalog.materials.glass, { x: 0, y: 2.62, z: 4.34 }, { x: 2.28, y: 1.0, z: 0.08 }, false);
  for (const side of [-1, 1]) {
    for (const z of [-2.6, -1.05, 0.5, 2.05]) {
      addBox(group, catalog, catalog.materials.glass, { x: side * 1.29, y: 2.34, z }, { x: 0.06, y: 0.78, z: 1.1 }, false);
    }
    for (const z of [-3.05, -1, 1, 3.05]) {
      const wheel = addCylinder(group, catalog, catalog.materials.tire, { x: side * 1.28, y: 0.62, z }, { x: 0.56, y: 0.28, z: 0.56 });
      wheel.rotation.z = Math.PI * 0.5;
    }
    addBox(group, catalog, catalog.materials.headlight, { x: side * 0.82, y: 1.05, z: 4.36 }, { x: 0.38, y: 0.26, z: 0.08 }, false);
    addBox(group, catalog, catalog.materials.taillight, { x: side * 0.82, y: 1.0, z: -4.36 }, { x: 0.32, y: 0.34, z: 0.08 }, false);
  }
}

function buildBoat(group, catalog, paint) {
  addBox(group, catalog, paint, { x: 0, y: 0.75, z: 0 }, { x: 2.2, y: 0.72, z: 5.4 });
  addBox(group, catalog, catalog.materials.glass, { x: 0, y: 1.42, z: -0.25 }, { x: 1.42, y: 0.88, z: 1.8 });
  addBox(group, catalog, catalog.materials.trim, { x: 0, y: 1.94, z: -0.25 }, { x: 1.52, y: 0.12, z: 1.92 }, false);
  addBox(group, catalog, catalog.materials.whiteLine, { x: 0, y: 0.55, z: 2.54 }, { x: 1.15, y: 0.12, z: 0.08 }, false);
}

function addCarWheels(group, catalog, bodyWidth, bodyLength) {
  const wheelPositions = [
    [-bodyWidth * 0.5, 0.55, bodyLength * 0.31],
    [bodyWidth * 0.5, 0.55, bodyLength * 0.31],
    [-bodyWidth * 0.5, 0.55, -bodyLength * 0.31],
    [bodyWidth * 0.5, 0.55, -bodyLength * 0.31]
  ];

  for (const position of wheelPositions) {
    const wheel = addCylinder(
      group,
      catalog,
      catalog.materials.tire,
      { x: position[0], y: position[1], z: position[2] },
      { x: 0.49, y: 0.22, z: 0.49 }
    );
    wheel.rotation.z = Math.PI * 0.5;

    const rim = addCylinder(
      group,
      catalog,
      catalog.materials.rim,
      { x: position[0] + Math.sign(position[0]) * 0.12, y: position[1], z: position[2] },
      { x: 0.24, y: 0.06, z: 0.24 },
      false
    );
    rim.rotation.z = Math.PI * 0.5;
  }
}

function buildTruck(group, catalog, paint) {
  addBox(group, catalog, paint, { x: 0, y: 0.98, z: 1.65 }, { x: 2.1, y: 1.85, z: 2.35 });
  addBox(group, catalog, catalog.materials.glass, { x: 0, y: 2.05, z: 2.55 }, { x: 1.72, y: 0.78, z: 0.18 });
  addBox(group, catalog, catalog.materials.trim, { x: 0, y: 0.56, z: 1.65 }, { x: 2.24, y: 0.16, z: 2.48 }, false);
  addBox(group, catalog, paint, { x: 0, y: 1.25, z: -1.45 }, { x: 2.35, y: 1.95, z: 3.35 });
  addBox(group, catalog, catalog.materials.trim, { x: 0, y: 2.27, z: -1.45 }, { x: 2.42, y: 0.12, z: 3.4 }, false);

  for (const z of [-2.5, -0.6, 0.9, 2.25]) {
    for (const side of [-1, 1]) {
      const wheel = addCylinder(
        group,
        catalog,
        catalog.materials.tire,
        { x: side * 1.08, y: 0.65, z },
        { x: 0.57, y: 0.28, z: 0.57 }
      );
      wheel.rotation.z = Math.PI * 0.5;
    }
  }

  for (const side of [-1, 1]) {
    addBox(group, catalog, catalog.materials.headlight, { x: side * 0.67, y: 0.93, z: 2.84 }, { x: 0.35, y: 0.28, z: 0.08 }, false);
    addBox(group, catalog, catalog.materials.taillight, { x: side * 0.92, y: 1.02, z: -3.15 }, { x: 0.2, y: 0.4, z: 0.08 }, false);
  }
}

function buildMotorcycle(group, catalog, paint, kind = "motorcycle") {
  const bicycle = kind === "bicycle";
  const scooter = kind === "scooter";
  const wheelPositions = [-1.25, 1.25];

  for (const z of wheelPositions) {
    const wheel = addCylinder(
      group,
      catalog,
      catalog.materials.tire,
      { x: 0, y: 0.52, z },
      { x: bicycle ? 0.54 : scooter ? 0.39 : 0.48, y: bicycle ? 0.09 : 0.14, z: bicycle ? 0.54 : scooter ? 0.39 : 0.48 }
    );
    wheel.rotation.z = Math.PI * 0.5;
  }

  if (bicycle) {
    addCylinder(group, catalog, catalog.materials.trim, { x: 0, y: 0.95, z: 0 }, { x: 0.055, y: 1.45, z: 0.055 });
    addBox(group, catalog, paint, { x: 0, y: 1.02, z: 0 }, { x: 0.12, y: 0.12, z: 2.25 });
    addBox(group, catalog, catalog.materials.trim, { x: 0, y: 1.5, z: -0.62 }, { x: 0.56, y: 0.08, z: 0.12 }, false);
    addBox(group, catalog, catalog.materials.trim, { x: 0, y: 1.52, z: 0.83 }, { x: 0.72, y: 0.07, z: 0.08 }, false);
    addBox(group, catalog, catalog.materials.headlight, { x: 0, y: 1.48, z: 0.92 }, { x: 0.14, y: 0.14, z: 0.08 }, false);
  } else {
    addCylinder(group, catalog, catalog.materials.trim, { x: 0, y: 1.02, z: 0 }, { x: 0.11, y: 0.88, z: 0.11 });
    addBox(group, catalog, paint, { x: 0, y: 1.05, z: 0.14 }, { x: 0.62, y: 0.36, z: 0.94 });
    addBox(group, catalog, paint, { x: 0, y: 1.25, z: -0.63 }, { x: 0.56, y: 0.22, z: 0.65 });
    addBox(group, catalog, catalog.materials.headlight, { x: 0, y: 1.24, z: 0.92 }, { x: 0.28, y: 0.24, z: 0.1 }, false);
    addBox(group, catalog, catalog.materials.trim, { x: 0, y: 1.58, z: 1.18 }, { x: 1.1, y: 0.08, z: 0.08 }, false);
  }

  for (const side of [-1, 1]) {
    addCylinder(group, catalog, catalog.materials.trim, { x: side * 0.38, y: 1.4, z: 0.4 }, { x: 0.045, y: 0.72, z: 0.045 });
  }
}
