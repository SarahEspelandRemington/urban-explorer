export interface BuildingTypeGroup {
  key: string;
  types: readonly string[];
}

export const BUILDING_TYPE_GROUPS: readonly BuildingTypeGroup[] = [
  {
    key: "residential",
    types: ["hut", "shed", "outhouse", "roof"],
  },
  {
    key: "agricultural",
    types: ["barn", "greenhouse", "silo"],
  },
  {
    key: "parking",
    types: ["garage", "garages", "carport", "parking", "bicycle_parking", "garbage_shed", "container"],
  },
  {
    key: "utility",
    types: ["storage_tank", "service", "kiosk", "toilets"],
  },
] as const;

export type BuildingGroupKey = "residential" | "agricultural" | "parking" | "utility";

export function groupKeysToIncludedTypes(enabledGroups: Set<BuildingGroupKey>): string[] {
  const types: string[] = [];
  for (const group of BUILDING_TYPE_GROUPS) {
    if (enabledGroups.has(group.key as BuildingGroupKey)) {
      types.push(...group.types);
    }
  }
  return types;
}
