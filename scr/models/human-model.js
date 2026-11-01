import * as THREE from "three";
import { addBox } from "./catalog.js";

export function createHuman(catalog, shirtMaterial, scale = 1, appearance = {}) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const torso = addBox(
    body,
    catalog,
    shirtMaterial,
    { x: 0, y: 1.12, z: 0 },
    { x: 0.48, y: 0.7, z: 0.3 }
  );
  torso.castShadow = true;

  const skin = appearance.skin ?? catalog.materials.skin;
  const hairMaterial = appearance.hair ?? catalog.materials.hair;
  const pants = appearance.pants ?? catalog.materials.buildings[4];
  const head = new THREE.Mesh(catalog.geometries.sphere, skin);
  head.position.set(0, 1.72, 0);
  head.scale.set(0.19, 0.22, 0.19);
  head.castShadow = true;
  body.add(head);

  const hair = new THREE.Mesh(catalog.geometries.sphere, hairMaterial);
  hair.position.set(0, 1.82, -0.012);
  hair.scale.set(0.19, 0.11, 0.19);
  hair.castShadow = true;
  body.add(hair);

  const leftArm = createLimb(catalog, body, shirtMaterial, 0.13, 0.55, -0.34, 1.32);
  const rightArm = createLimb(catalog, body, shirtMaterial, 0.13, 0.55, 0.34, 1.32);
  const leftLeg = createLimb(catalog, body, pants, 0.17, 0.68, -0.15, 0.69);
  const rightLeg = createLimb(catalog, body, pants, 0.17, 0.68, 0.15, 0.69);

  if (appearance.backpack) {
    addBox(body, catalog, catalog.materials.trim, { x: 0, y: 1.12, z: -0.22 }, { x: 0.34, y: 0.42, z: 0.18 });
  }
  if (appearance.hat) {
    const cap = new THREE.Mesh(catalog.geometries.sphere, appearance.hatMaterial ?? hairMaterial);
    cap.position.set(0, 1.9, 0.015);
    cap.scale.set(0.21, 0.075, 0.21);
    cap.castShadow = true;
    body.add(cap);
  }

  body.scale.setScalar(scale);
  root.userData.animateWalk = function animateWalk(phase, amount) {
    const swing = Math.sin(phase) * 0.48 * amount;
    leftLeg.rotation.x = swing;
    rightLeg.rotation.x = -swing;
    leftArm.rotation.x = -swing * 0.72;
    rightArm.rotation.x = swing * 0.72;
    body.position.y = Math.abs(Math.sin(phase * 2)) * 0.035 * amount;
  };

  root.userData.limbs = { leftArm, rightArm, leftLeg, rightLeg };
  root.traverse((object) => {
    if (object.isMesh) {
      // Hundreds of small characters made the shadow pass disproportionately
      // expensive. Their shading still comes from the scene lights.
      object.castShadow = false;
      object.receiveShadow = false;
    }
  });

  return root;
}

function createLimb(catalog, parent, material, width, height, x, y) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, 0);
  parent.add(pivot);

  addBox(
    pivot,
    catalog,
    material,
    { x: 0, y: -height * 0.5, z: 0 },
    { x: width, y: height, z: width }
  );

  return pivot;
}
