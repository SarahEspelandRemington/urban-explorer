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
  Text,
  View,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
  useColorScheme,
} from "react-native";

import { useColors } from "@/hooks/useColors";

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
   *   controls the icon square size (default 36 px); text size scales
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
  header: 36,
};

/**
 * Estimated width-to-height aspect ratios per single-image variant.
 * Not used for `header` (which composes an image and live text).
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
  header: 1,
};

/**
 * Renders the Streetlit logo in the appropriate variant and colour scheme.
 * Automatically selects dark or light assets; never tints or recolours.
 *
 * Variants:
 *   header   — compact app mark for screen headers:
 *              [rounded-icon] + live text "street" (foreground) + "lit" (primary).
 *              Uses live text, not the wordmark image asset, so the tagline
 *              baked into the wordmark PNG never appears here.
 *   wordmark — wordmark/tagline image strip (includes tagline — use on
 *              login/splash/intro surfaces only, not in tight headers)
 *   lockup   — horizontal icon + wordmark (pre-composed asset)
 *   vertical — icon stacked above wordmark (pre-composed asset)
 *   splash   — full-bleed splash composition
 *   icon     — rounded-square badge
 *
 * Usage:
 *   <StreetlitLogo variant="header" />          // Explore/home header
 *   <StreetlitLogo variant="vertical" />        // login screen
 *   <StreetlitLogo variant="wordmark" width={160} />
 */
export function StreetlitLogo({
  variant = "lockup",
  width,
  style,
}: StreetlitLogoProps) {
  const colorScheme = useColorScheme();
  const colors = useColors();
  const theme = colorScheme === "dark" ? "dark" : "light";

  if (variant === "header") {
    // Text-only wordmark — no icon, no tagline.
    // Inter_400Regular with open tracking reads as editorial and light;
    // closest available to the designed serif wordmark without adding a
    // new font dependency. 36 px aligns naturally with the header row.
    return (
      <View
        style={[{ flexDirection: "row", alignItems: "center" }, style]}
        accessible
        accessibilityLabel="Streetlit"
        accessibilityRole="image"
      >
        <Text
          style={{
            fontSize: 32,
            fontFamily: "Inter_400Regular",
            letterSpacing: 1.5,
            includeFontPadding: false,
          }}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Text style={{ color: colors.foreground }}>{"street"}</Text>
          <Text style={{ color: colors.primary }}>{"lit"}</Text>
        </Text>
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
