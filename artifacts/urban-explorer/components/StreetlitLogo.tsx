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
  type ImageStyle,
  type StyleProp,
  useColorScheme,
} from "react-native";

export type StreetlitLogoVariant =
  | "wordmark"
  | "lockup"
  | "vertical"
  | "icon"
  | "splash";

interface StreetlitLogoProps {
  variant?: StreetlitLogoVariant;
  /**
   * Rendered width in pixels. Height is derived automatically via
   * `aspectRatio` so the image never distorts. Defaults per variant:
   *   wordmark → 200, lockup → 220, vertical → 160, splash → 280, icon → 48
   */
  width?: number;
  style?: StyleProp<ImageStyle>;
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
};

/**
 * Estimated width-to-height aspect ratios per variant. These prevent the
 * image from collapsing to zero height when only a width is specified.
 * Derived from the asset package artwork; adjust if final production exports
 * have different proportions.
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
};

/**
 * Renders the Streetlit logo in the appropriate variant and colour-scheme
 * variant. Automatically selects dark or light assets based on the system
 * colour scheme; never tints or recolours the image.
 *
 * Usage:
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
  const source = IMAGES[isDark ? "dark" : "light"][variant];
  const w = width ?? DEFAULT_WIDTHS[variant];

  return (
    <Image
      source={source}
      style={[{ width: w, aspectRatio: ASPECT_RATIOS[variant] }, style]}
      resizeMode="contain"
      accessibilityLabel="Streetlit"
      accessibilityRole="image"
    />
  );
}
