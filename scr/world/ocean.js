import * as THREE from "three";
import { CONFIG } from "../config.js";
import { coastlineAt } from "./road-network.js";

export class Ocean {
  constructor(scene, catalog) {
    this.scene = scene;
    this.catalog = catalog;
    this.elapsed = 0;
    this.waveColumns = 72;
    this.waveRows = 36;
    this.mesh = this.createWater();
    this.beach = this.createBeach();
    this.scene.add(this.mesh, this.beach);
  }

  createWater() {
    const columns = this.waveColumns;
    const rows = this.waveRows;
    const positions = [];
    const indices = [];
    const width = CONFIG.coastWidth;
    const depth = CONFIG.oceanDepth;
    const startX = -width * 0.5;

    for (let row = 0; row <= rows; row += 1) {
      const rowAmount = row / rows;

      for (let column = 0; column <= columns; column += 1) {
        const x = startX + width * column / columns;
        const z = coastlineAt(x) + 1 + depth * rowAmount;
        positions.push(x, -0.18, z);

        if (row < rows && column < columns) {
          const a = row * (columns + 1) + column;
          const b = a + 1;
          const c = a + columns + 1;
          const d = c + 1;
          indices.push(a, c, b, b, c, d);
        }
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const mesh = new THREE.Mesh(geometry, this.catalog.materials.ocean);
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    return mesh;
  }

  createBeach() {
    const columns = 72;
    const positions = [];
    const indices = [];

    for (let column = 0; column <= columns; column += 1) {
      const x = -CONFIG.coastWidth * 0.5 + CONFIG.coastWidth * column / columns;
      const coast = coastlineAt(x);
      positions.push(x, -0.02, coast - 118);
      positions.push(x, -0.02, coast + 1);

      if (column < columns) {
        const a = column * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const beach = new THREE.Mesh(geometry, this.catalog.materials.sand);
    beach.receiveShadow = true;
    beach.frustumCulled = false;
    return beach;
  }

  update(deltaSeconds) {
    this.elapsed += deltaSeconds;
    this.updateCooldown = (this.updateCooldown ?? 0) - deltaSeconds;
    if (this.updateCooldown > 0) return;
    this.updateCooldown = 0.04;

    const position = this.mesh.geometry.attributes.position;
    const vertices = position.array;
    const columns = this.waveColumns + 1;
    const rows = this.waveRows;

    for (let row = 0; row <= rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const index = row * columns + column;
        const vertexIndex = index * 3;
        const x = vertices[vertexIndex];
        const z = vertices[vertexIndex + 2];
        const wave = Math.sin(x * 0.004 + this.elapsed * 0.56) * 0.16 +
          Math.sin(z * 0.0031 - this.elapsed * 0.37) * 0.11;
        vertices[vertexIndex + 1] = -0.18 + wave;
      }
    }

    position.needsUpdate = true;
  }
}
