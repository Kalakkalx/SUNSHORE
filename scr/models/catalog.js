import * as THREE from "three";
import { BUILDING_PALETTE, PEDESTRIAN_PALETTE, VEHICLE_PALETTE } from "../config.js";

export function createCatalog() {
  const box = new THREE.BoxGeometry(1, 1, 1);
  const sphere = new THREE.SphereGeometry(1, 14, 10);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 12);
  const cone = new THREE.ConeGeometry(1, 1, 9);
  const wheel = new THREE.CylinderGeometry(0.5, 0.5, 0.34, 16);
  const palmFrond = new THREE.ConeGeometry(1, 1, 7, 1);
  const circle = new THREE.CircleGeometry(1, 20);
  const mountain = new THREE.ConeGeometry(1, 1, 10, 4);
  const trailCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.88, -0.39, 0),
    new THREE.Vector3(0, -0.23, 0.72),
    new THREE.Vector3(0.55, -0.04, 0),
    new THREE.Vector3(0, 0.14, -0.36),
    new THREE.Vector3(-0.18, 0.32, 0)
  ]);
  const trail = new THREE.TubeGeometry(trailCurve, 20, 0.008, 5, false);

  const buildingMaterials = BUILDING_PALETTE.map((color) =>
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.78,
      metalness: 0.04
    })
  );

  const vehicleMaterials = VEHICLE_PALETTE.map((color) =>
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.34,
      metalness: 0.42
    })
  );

  const pedestrianMaterials = PEDESTRIAN_PALETTE.map((color) =>
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.86
    })
  );

  const materials = {
    asphalt: new THREE.MeshStandardMaterial({
      color: 0x34383a,
      roughness: 0.91,
      metalness: 0.02
    }),
    land: new THREE.MeshStandardMaterial({
      color: 0x777a70,
      roughness: 0.98
    }),
    sidewalk: new THREE.MeshStandardMaterial({
      color: 0x9d9a8f,
      roughness: 0.94
    }),
    curb: new THREE.MeshStandardMaterial({
      color: 0xc0b9a9,
      roughness: 0.84
    }),
    yellowLine: new THREE.MeshStandardMaterial({
      color: 0xe5b957,
      roughness: 0.72,
      emissive: 0x241600
    }),
    whiteLine: new THREE.MeshStandardMaterial({
      color: 0xdedfd8,
      roughness: 0.76
    }),
    freeway: new THREE.MeshStandardMaterial({
      color: 0x292e31,
      roughness: 0.94
    }),
    mountainRoad: new THREE.MeshStandardMaterial({
      color: 0x56544c,
      roughness: 0.98
    }),
    trail: new THREE.MeshStandardMaterial({
      color: 0x8c7958,
      roughness: 1
    }),
    bridge: new THREE.MeshStandardMaterial({
      color: 0x777a77,
      roughness: 0.9
    }),
    barrier: new THREE.MeshStandardMaterial({
      color: 0xc9c3b1,
      roughness: 0.86
    }),
    roadSign: new THREE.MeshStandardMaterial({
      color: 0x2d674c,
      roughness: 0.72,
      metalness: 0.12
    }),
    roadSignText: new THREE.MeshStandardMaterial({
      color: 0xf0e9d8,
      roughness: 0.7
    }),
    signalRed: new THREE.MeshStandardMaterial({ color: 0xf14e45, emissive: 0xc41d17, emissiveIntensity: 0.15 }),
    signalAmber: new THREE.MeshStandardMaterial({ color: 0xf5be4f, emissive: 0xb07816, emissiveIntensity: 0.15 }),
    signalGreen: new THREE.MeshStandardMaterial({ color: 0x66db8b, emissive: 0x16743b, emissiveIntensity: 0.15 }),
    signalDark: new THREE.MeshStandardMaterial({ color: 0x202729, roughness: 0.6 }),
    streetlight: new THREE.MeshStandardMaterial({ color: 0xf7d8a0, emissive: 0xffb750, emissiveIntensity: 0.12 }),
    park: new THREE.MeshStandardMaterial({ color: 0x4e7654, roughness: 0.98 }),
    parkPath: new THREE.MeshStandardMaterial({ color: 0xc1b697, roughness: 0.96 }),
    dock: new THREE.MeshStandardMaterial({ color: 0x74563d, roughness: 0.93 }),
    canal: new THREE.MeshPhysicalMaterial({
      color: 0x286d79,
      roughness: 0.3,
      metalness: 0.08,
      clearcoat: 0.4
    }),
    mountain: [0x777a73, 0x85847c, 0x696d69, 0x908b7d].map((color) =>
      new THREE.MeshStandardMaterial({ color, roughness: 1 })
    ),
    deco: new THREE.MeshStandardMaterial({
      color: 0xc2a36e,
      roughness: 0.78
    }),
    terracotta: new THREE.MeshStandardMaterial({
      color: 0x934e38,
      roughness: 0.9
    }),
    awning: new THREE.MeshStandardMaterial({
      color: 0x9e5142,
      roughness: 0.84
    }),
    marquee: new THREE.MeshStandardMaterial({
      color: 0xd45a7e,
      emissive: 0x7b1d4a,
      emissiveIntensity: 1.15,
      roughness: 0.36
    }),
    warehouseDoor: new THREE.MeshStandardMaterial({
      color: 0x555d5e,
      roughness: 0.76,
      metalness: 0.2
    }),
    stone: new THREE.MeshStandardMaterial({
      color: 0xb9b09b,
      roughness: 0.92
    }),
    glass: new THREE.MeshStandardMaterial({
      color: 0x26353a,
      roughness: 0.19,
      metalness: 0.18
    }),
    window: new THREE.MeshStandardMaterial({
      color: 0xd5c8aa,
      emissive: 0x66513a,
      emissiveIntensity: 0.28,
      roughness: 0.32,
      metalness: 0.08
    }),
    roof: new THREE.MeshStandardMaterial({
      color: 0x666762,
      roughness: 0.86
    }),
    trim: new THREE.MeshStandardMaterial({
      color: 0x252b2c,
      roughness: 0.56,
      metalness: 0.3
    }),
    tire: new THREE.MeshStandardMaterial({
      color: 0x171a1b,
      roughness: 0.92
    }),
    damage: new THREE.MeshStandardMaterial({ color: 0x4b332b, roughness: 0.86, metalness: 0.08 }),
    rim: new THREE.MeshStandardMaterial({
      color: 0x9b9d98,
      roughness: 0.37,
      metalness: 0.7
    }),
    headlight: new THREE.MeshStandardMaterial({
      color: 0xffecc0,
      emissive: 0xffc36a,
      emissiveIntensity: 1.4,
      roughness: 0.22
    }),
    taillight: new THREE.MeshStandardMaterial({
      color: 0xb22d22,
      emissive: 0x871c10,
      emissiveIntensity: 0.9,
      roughness: 0.28
    }),
    sand: new THREE.MeshStandardMaterial({
      color: 0xcab38b,
      roughness: 0.98
    }),
    ocean: new THREE.MeshPhysicalMaterial({
      color: 0x277b8a,
      roughness: 0.24,
      metalness: 0.13,
      clearcoat: 0.46,
      clearcoatRoughness: 0.24
    }),
    palm: new THREE.MeshStandardMaterial({
      color: 0x557653,
      roughness: 0.9
    }),
    bark: new THREE.MeshStandardMaterial({
      color: 0x735539,
      roughness: 0.95
    }),
    skin: new THREE.MeshStandardMaterial({
      color: 0xc78f6b,
      roughness: 0.82
    }),
    skins: [0x784b38, 0x9c6348, 0xc78f6b, 0xe0ad89, 0xf0c8a4].map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.82 })),
    hair: new THREE.MeshStandardMaterial({
      color: 0x342a25,
      roughness: 0.9
    }),
    hairColors: [0x211d1b, 0x59402f, 0x92704b, 0x332e42].map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.9 })),
    buildingGlass: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x44372a,
      emissiveIntensity: 0.18,
      roughness: 0.25,
      metalness: 0.08
    })
  };

  return {
    geometries: {
      box,
      sphere,
      cylinder,
      cone,
      wheel,
      palmFrond,
      circle,
      mountain,
      trail
    },
    materials: {
      ...materials,
      buildings: buildingMaterials,
      vehicles: vehicleMaterials,
      pedestrians: pedestrianMaterials
    }
  };
}

export function addBox(group, catalog, material, position, scale, castShadow = false) {
  const mesh = new THREE.Mesh(catalog.geometries.box, material);

  mesh.position.set(position.x, position.y, position.z);
  mesh.scale.set(scale.x, scale.y, scale.z);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  group.add(mesh);

  return mesh;
}

export function addCylinder(group, catalog, material, position, scale, castShadow = true) {
  const mesh = new THREE.Mesh(catalog.geometries.cylinder, material);

  mesh.position.set(position.x, position.y, position.z);
  mesh.scale.set(scale.x, scale.y, scale.z);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  group.add(mesh);

  return mesh;
}
