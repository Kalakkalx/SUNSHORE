export const LANDMARKS = Object.freeze([
  { id: "garage", name: "Harborline Garage", kind: "GARAGE", x: 520, z: -130, icon: "G" },
  { id: "park", name: "Cypress Commons", kind: "PARK", x: -1300, z: 380, icon: "P" },
  { id: "harbor", name: "South Harbor", kind: "HARBOR", x: 2580, z: 1310, icon: "H" },
  { id: "airport", name: "Sunshore Airfield", kind: "AIRPORT", x: 3900, z: -1200, icon: "A" },
  { id: "beach", name: "West Beach", kind: "BEACH", x: -3250, z: 1140, icon: "B" },
  { id: "trail", name: "Summit Trailhead", kind: "TRAIL", x: -520, z: -1930, icon: "T" },
  { id: "market", name: "Central Market", kind: "SHOP", x: 260, z: -520, icon: "$" },
  { id: "hotel", name: "Coastline Hotel", kind: "SHOP", x: -780, z: 650, icon: "H" }
]);

export function landmarkDistance(landmark, position) {
  return Math.hypot(landmark.x - position.x, landmark.z - position.z);
}
