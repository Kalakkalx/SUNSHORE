import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { clone as cloneSkinnedModel } from "three/addons/utils/SkeletonUtils.js";

export const IMPORTED_VEHICLES = Object.freeze([
  { id: "mustang", label: "MUSTANG GT", file: "car1.glb" },
  { id: "courier", label: "TRANSIT COURIER", file: "car2.glb" },
  { id: "heritage-gt", label: "HERITAGE GT", file: "car3.glb" },
  { id: "cortina", label: "CLASSIC CORTINA", file: "car4.glb" },
  { id: "raptor", label: "RAPTOR PICKUP", file: "car5.glb" },
  { id: "shelby-police", label: "SHELBY POLICE", file: "police.glb" }
]);

export async function loadImportedVehicle(entry) {
  const loader = new GLTFLoader();
  const url = new URL(`../../models/${entry.file}`, import.meta.url);
  const gltf = await loader.loadAsync(url.href);
  return prepareVehicleModel(gltf.scene);
}

export function cloneImportedVehicle(model) {
  return cloneSkinnedModel(model);
}

function prepareVehicleModel(source) {
  const hasSkinnedMesh = hasSkinnedMeshIn(source);
  const model = hasSkinnedMesh ? source : mergeStaticMeshes(source);
  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const horizontalLength = Math.max(size.x, size.z);
  const scale = horizontalLength > 0 ? 4.8 / horizontalLength : 1;

  model.scale.multiplyScalar(scale);
  model.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
  model.updateMatrixWorld(true);
  model.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = false;
    object.receiveShadow = true;
  });
  return model;
}

function hasSkinnedMeshIn(root) {
  let found = false;
  root.traverse((object) => {
    if (object.isSkinnedMesh) found = true;
  });
  return found;
}

function mergeStaticMeshes(source) {
  source.updateMatrixWorld(true);
  const batches = new Map();
  const fallbackMeshes = [];

  source.traverse((object) => {
    if (!object.isMesh || object.isSkinnedMesh || Array.isArray(object.material)) return;

    const geometry = object.geometry.clone();
    geometry.applyMatrix4(object.matrixWorld);
    const attributeSignature = Object.keys(geometry.attributes).sort().join(",");
    const key = `${object.material.uuid}|${attributeSignature}|${Boolean(geometry.index)}`;
    let batch = batches.get(key);
    if (!batch) {
      batch = { material: object.material, geometries: [] };
      batches.set(key, batch);
    }
    batch.geometries.push(geometry);
  });

  const mergedRoot = new THREE.Group();
  for (const batch of batches.values()) {
    try {
      const geometry = batch.geometries.length === 1
        ? batch.geometries[0]
        : mergeGeometries(batch.geometries, false);
      if (!geometry) throw new Error("The vehicle mesh attributes could not be merged.");
      const mesh = new THREE.Mesh(geometry, batch.material);
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mergedRoot.add(mesh);
    } catch {
      fallbackMeshes.push(...batch.geometries.map((geometry) => new THREE.Mesh(geometry, batch.material)));
    }
  }

  for (const mesh of fallbackMeshes) {
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mergedRoot.add(mesh);
  }
  source.traverse((object) => object.geometry?.dispose?.());
  return mergedRoot;
}
