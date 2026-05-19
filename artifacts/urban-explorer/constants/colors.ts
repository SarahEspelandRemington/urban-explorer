const CATEGORY_COLORS = {
  light: {
    sage: "#4F7A5A",
    terracotta: "#9A6E58",
    mauve: "#6E5E7E",
  },
  dark: {
    sage: "#6E9975",
    terracotta: "#AC8270",
    mauve: "#907892",
  },
};

const colors = {
  light: {
    text: "#102033",
    tint: "#E98D32",

    background: "#FFF8EE",
    foreground: "#102033",

    card: "#FFFFFF",
    cardForeground: "#102033",

    primary: "#E98D32",
    primaryForeground: "#FFFFFF",

    secondary: "#294055",
    secondaryForeground: "#FFF8EE",

    muted: "#F4E6D6",
    mutedForeground: "#6F6372",

    accent: "#8E668C",
    accentForeground: "#FFFFFF",

    accentCyan: "#4DB7C5",
    accentGreen: "#A8D85B",

    destructive: "#dc2626",
    destructiveForeground: "#ffffff",

    border: "#E7D4C0",
    input: "#E7D4C0",

    categorySage: CATEGORY_COLORS.light.sage,
    categoryTerracotta: CATEGORY_COLORS.light.terracotta,
    categoryMauve: CATEGORY_COLORS.light.mauve,
  },

  dark: {
    text: "#FFF7E8",
    tint: "#F2A23A",

    background: "#081827",
    foreground: "#FFF7E8",

    card: "#102537",
    cardForeground: "#FFF7E8",

    primary: "#F2A23A",
    primaryForeground: "#081827",

    secondary: "#1A3144",
    secondaryForeground: "#FFF7E8",

    muted: "#1A3144",
    mutedForeground: "#B8AFC0",

    accent: "#C77A8F",
    accentForeground: "#081827",

    accentCyan: "#4DB7C5",
    accentGreen: "#A8D85B",

    destructive: "#ef4444",
    destructiveForeground: "#ffffff",

    border: "#294055",
    input: "#294055",

    categorySage: CATEGORY_COLORS.dark.sage,
    categoryTerracotta: CATEGORY_COLORS.dark.terracotta,
    categoryMauve: CATEGORY_COLORS.dark.mauve,
  },

  radius: 12,
};

export default colors;
