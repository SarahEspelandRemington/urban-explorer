# Streetlit Logo Asset Package

Source: high-resolution logo artwork extracted from the supplied Streetlit PowerPoint deck / prior generated logo file. These are PNG exports intended for app integration and testing.

## Recommended files

- `streetlit-app-icon-1024.png` — square app icon master; use for Expo `icon` if appropriate.
- `streetlit-icon-rounded-1024.png` — rounded in-app icon/badge, transparent outside the rounded square.
- `streetlit-icon-rounded-512.png` — smaller in-app icon/badge.
- `streetlit-lockup-dark.png` — horizontal lockup for dark UI surfaces; transparent background.
- `streetlit-lockup-light.png` — horizontal lockup for light UI surfaces; transparent background.
- `streetlit-wordmark-dark.png` — wordmark/tagline only for dark UI; transparent background.
- `streetlit-wordmark-light.png` — wordmark/tagline only for light UI; transparent background.
- `streetlit-splash-dark.png` — full splash/loading composition on dark navy background.
- `streetlit-splash-light.png` — full splash/loading composition on light cream background.
- `streetlit-vertical-lockup-dark.png` and `streetlit-vertical-lockup-light.png` — transparent vertical lockups for flexible placements.
- `streetlit-logo-source-from-deck.png` — source reference image.

## Notes

- Do not tint these assets in code.
- Use theme-aware selection: dark assets on dark surfaces, light assets on light surfaces.
- Prefer the lockup only where there is room; use the icon-only asset in tight headers/nav.
- If this moves to production, a designer should ideally export final vector/SVG originals. These PNGs are suitable for implementation/testing.
