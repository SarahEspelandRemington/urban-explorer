import wordmarkDark from "../assets/branding/streetlit-wordmark-dark.png";
import wordmarkLight from "../assets/branding/streetlit-wordmark-light.png";
import lockupDark from "../assets/branding/streetlit-lockup-dark.png";
import lockupLight from "../assets/branding/streetlit-lockup-light.png";
import verticalDark from "../assets/branding/streetlit-vertical-lockup-dark.png";
import verticalLight from "../assets/branding/streetlit-vertical-lockup-light.png";
import splashDark from "../assets/branding/streetlit-splash-dark.png";
import splashLight from "../assets/branding/streetlit-splash-light.png";
import icon from "../assets/branding/streetlit-icon-rounded-512.png";
import React from "react";
import {
  Image,
  View,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
  useColorScheme,
} from "react-native";

export type StreetlitLogoVariant =
  | "wordmark"
  | "lockup"
  | "vertical"
  | "icon"
  | "splash"
  | "header";

interface StreetlitLogoProps {
  variant?: StreetlitLogoVariant;
  /**
   * For single-image variants (wordmark, lockup, vertical, splash, icon):
   *   rendered width in pixels; height is derived via `aspectRatio`.
   * For the `header` variant:
   *   controls the icon square size (default 36 px); wordmark scales
   *   proportionally beside it.
   * Defaults per variant:
   *   wordmark → 200, lockup → 220, vertical → 160, splash → 280,
   *   icon → 48, header → 36 (icon side)
   */
  width?: number;
  /** Applied to the outer container (View for `header`, Image for all others). */
  style?: StyleProp<ViewStyle>;
}

const IMAGES = {
  dark: {
    wordmark: wordmarkDark,
    lockup: lockupDark,
    vertical: verticalDark,
    splash: splashDark,
    icon,
  },
  light: {
    wordmark: wordmarkLight,
    lockup: lockupLight,
    vertical: verticalLight,
    splash: splashLight,
    icon,
  },
} as const;

const DEFAULT_WIDTHS: Record<StreetlitLogoVariant, number> = {
  wordmark: 200,
  lockup: 220,
  vertical: 160,
  splash: 280,
  icon: 48,
  header: 36, // icon side; wordmark width derived from this
};

/**
 * Estimated width-to-height aspect ratios per single-image variant.
 * Not used for `header` (which composes two images into a row View).
 *
 *   wordmark  — wide shallow text strip           (~4.5 : 1)
 *   lockup    — horizontal icon + wordmark        (~3.5 : 1)
 *   vertical  — icon stacked above wordmark       (~0.75 : 1, taller)
 *   splash    — full-bleed splash composition     (~1 : 1)
 *   icon      — rounded-square badge              (~1 : 1)
 */
const ASPECT_RATIOS: Record<StreetlitLogoVariant, number> = {
  wordmark: 4.5,
  lockup: 3.5,
  vertical: 0.75,
  splash: 1,
  icon: 1,
  header: 1, // unused; header renders its own layout
};

/**
 * Gap between the icon and the wordmark in the `header` variant (px).
 * Wordmark width relative to the icon size — at the default 36 px icon the
 * wordmark renders at 36 × 3.33 ≈ 120 px, totalling ~164 px.
 */
const HEADER_GAP = 8;
const HEADER_WORDMARK_RATIO = 10 / 3; // wordmark_width = iconSize × ratio ≈ 3.33

/**
 * Renders the Streetlit logo in the appropriate variant and colour scheme.
 * Automatically selects dark or light assets; never tints or recolours.
 *
 * Variants:
 *   header   — [rounded-icon]  [wordmark]  side by side; use in screen headers
 *   wordmark — text-only wordmark strip
 *   lockup   — horizontal icon + wordmark (pre-composed asset)
 *   vertical — icon stacked above wordmark (pre-composed asset)
 *   splash   — full-bleed splash composition
 *   icon     — rounded-square badge
 *
 * Usage:
 *   <StreetlitLogo variant="header" />
 *   <StreetlitLogo variant="vertical" />
 *   <StreetlitLogo variant="wordmark" width={160} />
 */
export function StreetlitLogo({
  variant = "lockup",
  width,
  style,
}: StreetlitLogoProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const theme = isDark ? "dark" : "light";

  if (variant === "header") {
    const iconSize = width ?? DEFAULT_WIDTHS.header;
    const wordmarkWidth = Math.round(iconSize * HEADER_WORDMARK_RATIO);

    return (
      <View
        style={[
          { flexDirection: "row", alignItems: "center", gap: HEADER_GAP },
          style,
        ]}
        accessible
        accessibilityLabel="Streetlit"
        accessibilityRole="image"
      >
        <Image
          source={IMAGES[theme].icon}
          style={{ width: iconSize, height: iconSize } as ImageStyle}
          resizeMode="contain"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
        <Image
          source={IMAGES[theme].wordmark}
          style={{ width: wordmarkWidth, height: iconSize } as ImageStyle}
          resizeMode="contain"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      </View>
    );
  }

  const source = IMAGES[theme][variant];
  const w = width ?? DEFAULT_WIDTHS[variant];

  return (
    <Image
      source={source}
      style={
        [
          { width: w, aspectRatio: ASPECT_RATIOS[variant] },
          style,
        ] as StyleProp<ImageStyle>
      }
      resizeMode="contain"
      accessibilityLabel="Streetlit"
      accessibilityRole="image"
    />
  );
}
