export class SpatialGrid {
  constructor(cellSize = 32) {
    this.cellSize = cellSize;
    this.cells = new Map();
    this.cellPool = [];
  }

  clear() {
    for (const cell of this.cells.values()) {
      cell.length = 0;
      this.cellPool.push(cell);
    }
    this.cells.clear();
  }

  insert(item, x, z) {
    const key = this.keyFor(x, z);
    let cell = this.cells.get(key);
    if (!cell) {
      cell = this.cellPool.pop() ?? [];
      this.cells.set(key, cell);
    }
    cell.push(item);
  }

  forEachNear(x, z, radius, visit) {
    const spread = Math.ceil(radius / this.cellSize);
    const centerX = Math.floor(x / this.cellSize);
    const centerZ = Math.floor(z / this.cellSize);
    const radiusSquared = radius * radius;

    for (let cellZ = centerZ - spread; cellZ <= centerZ + spread; cellZ += 1) {
      for (let cellX = centerX - spread; cellX <= centerX + spread; cellX += 1) {
        const cell = this.cells.get(cellX + ":" + cellZ);
        if (!cell) continue;

        for (const item of cell) {
          const dx = item.group.position.x - x;
          const dz = item.group.position.z - z;
          const distanceSquared = dx * dx + dz * dz;
          if (distanceSquared <= radiusSquared && visit(item, distanceSquared) === false) {
            return false;
          }
        }
      }
    }
    return true;
  }

  keyFor(x, z) {
    return Math.floor(x / this.cellSize) + ":" + Math.floor(z / this.cellSize);
  }
}
