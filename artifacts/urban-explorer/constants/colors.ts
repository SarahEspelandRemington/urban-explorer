const CATEGORY_COLORS = {
  light: {
    sage: "#4D5E4A",
    terracotta: "#8B5E47",
    mauve: "#6E5C6B",
  },
  dark: {
    sage: "#8A9A86",
    terracotta: "#B4846C",
    mauve: "#988496",
  },
};

const colors = {
  light: {
    text: "#2C2A28",
    tint: "#9C5A2E",

    background: "#F5F3F0",
    foreground: "#2C2A28",

    card: "#FFFFFF",
    cardForeground: "#2C2A28",

    primary: "#9C5A2E",
    primaryForeground: "#FFFFFF",

    secondary: "#353230",
    secondaryForeground: "#F5F3F0",

    muted: "#EDEBE8",
    mutedForeground: "#5C5752",

    accent: "#8B5E47",
    accentForeground: "#FFFFFF",

    destructive: "#dc2626",
    destructiveForeground: "#ffffff",

    border: "#E5E2DD",
    input: "#E5E2DD",

    categorySage: CATEGORY_COLORS.light.sage,
    categoryTerracotta: CATEGORY_COLORS.light.terracotta,
    categoryMauve: CATEGORY_COLORS.light.mauve,
  },

  dark: {
    text: "#E2DFD8",
    tint: "#D4845A",

    background: "#242220",
    foreground: "#E2DFD8",

    card: "#2C2A28",
    cardForeground: "#E2DFD8",

    primary: "#D4845A",
    primaryForeground: "#242220",

    secondary: "#353230",
    secondaryForeground: "#E2DFD8",

    muted: "#2C2A28",
    mutedForeground: "#9A968C",

    accent: "#B4846C",
    accentForeground: "#242220",

    destructive: "#ef4444",
    destructiveForeground: "#ffffff",

    border: "rgba(255,255,255,0.06)",
    input: "rgba(255,255,255,0.06)",

    categorySage: CATEGORY_COLORS.dark.sage,
    categoryTerracotta: CATEGORY_COLORS.dark.terracotta,
    categoryMauve: CATEGORY_COLORS.dark.mauve,
  },

  radius: 12,
};

export default colors;
