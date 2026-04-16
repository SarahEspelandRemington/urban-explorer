export const CATEGORY_ICONS: Record<string, string> = {
  building: "office-building",
  monument: "pillar",
  park: "tree",
  bridge: "bridge",
  church: "church",
  museum: "bank",
  theater: "drama-masks",
  "historic site": "castle",
  storefront: "storefront-outline",
  alley: "road-variant",
  corner: "sign-direction",
  mural: "palette",
  infrastructure: "wrench",
  "former site": "history",
  "architectural detail": "eye-outline",
  residential: "home-variant",
  school: "school",
  arts_centre: "palette",
  theatre: "drama-masks",
};

export type CategoryColorKey = "categorySage" | "categoryTerracotta" | "categoryMauve";

export const CATEGORY_COLOR_MAP: Record<string, CategoryColorKey> = {
  building: "categorySage",
  monument: "categoryTerracotta",
  park: "categorySage",
  bridge: "categoryMauve",
  church: "categoryTerracotta",
  museum: "categoryMauve",
  theater: "categoryTerracotta",
  "historic site": "categoryMauve",
};

export function getCategoryColor(category: string, colors: any): string {
  const key = CATEGORY_COLOR_MAP[category.toLowerCase()] || "categorySage";
  return colors[key] || colors.primary;
}

export function getCategoryIcon(category: string): string {
  return CATEGORY_ICONS[category.toLowerCase()] || "map-marker";
}
