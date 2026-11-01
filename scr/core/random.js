export function mix32(value) {
  let mixed = value >>> 0;

  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x7feb352d);
  mixed = Math.imul(mixed ^ (mixed >>> 15), 0x846ca68b);
  mixed ^= mixed >>> 16;

  return mixed >>> 0;
}

export function hash2(seed, x, z, salt = 0) {
  const first = Math.imul((x | 0) ^ seed, 0x9e3779b1);
  const second = Math.imul((z | 0) ^ salt, 0x85ebca77);

  return mix32(first ^ second ^ seed ^ salt);
}

export function unitFromHash(value) {
  return (value >>> 0) / 0x100000000;
}

export function seededRandom(seed, x, z, salt = 0) {
  let state = hash2(seed, x, z, salt);

  return function nextRandom() {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export function createWorldSeed() {
  const address = new URLSearchParams(window.location.search);
  const requestedSeed = address.get("seed");

  if (requestedSeed !== null && requestedSeed.length > 0) {
    let hash = 2166136261;

    for (let index = 0; index < requestedSeed.length; index += 1) {
      hash ^= requestedSeed.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }

    return mix32(hash);
  }

  if (window.crypto && typeof window.crypto.getRandomValues === "function") {
    const seedArray = new Uint32Array(1);
    window.crypto.getRandomValues(seedArray);
    return seedArray[0] >>> 0;
  }

  return mix32(
    Date.now() ^
    Math.floor(Math.random() * 0xffffffff)
  );
}

export function choose(array, random) {
  const index = Math.floor(random() * array.length);
  return array[Math.min(index, array.length - 1)];
}
