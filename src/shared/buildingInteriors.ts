/**
 * Walk-in interiors: map an Easy Scene street building to an Easy Interior
 * (or legacy Easy Scene) scene. The JSON snapshot is copied from
 * easyinterior/catalog/buildings.json; re-copy when that catalog changes.
 *
 * Games can also read the `interior` field stamped on building part.json.
 * Stalls and religious buildings are intentionally unmapped.
 */
import catalog from "./building-interiors.json" with { type: "json" };

export interface BuildingInterior {
  building: string;
  scene: string;
  type: string;
  seed: number;
  part: string;
  counter?: string;
  kind: "shop" | "house" | "civic" | "transit";
  halal?: boolean;
  sign: string;
}

export const BUILDING_INTERIORS: BuildingInterior[] = (catalog as { buildings: BuildingInterior[] }).buildings;

const BY_BUILDING = new Map(BUILDING_INTERIORS.map((b) => [b.building, b]));

export function interiorOf(building: string): BuildingInterior | undefined {
  return BY_BUILDING.get(building);
}
