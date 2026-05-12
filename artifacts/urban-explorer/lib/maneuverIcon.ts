import type { ComponentProps } from "react";
import type { Feather } from "@expo/vector-icons";

type FeatherIconName = ComponentProps<typeof Feather>["name"];

/**
 * Maps an OSRM maneuver type + optional modifier string to a Feather icon name.
 *
 * `modifier` may be an explicit OSRM modifier ("slight left", "sharp right",
 * etc.) or a hint sniffed from the first word of the instruction text.
 * Left/right substring matching covers all OSRM variants
 * (left, slight left, sharp left, uturn, etc.).
 */
export function maneuverIcon(type: string, modifier?: string): FeatherIconName {
  if (type === "depart") return "navigation";
  if (type === "arrive") return "flag";
  if (type === "roundabout" || type === "rotary") return "refresh-cw";
  const m = (modifier ?? "").toLowerCase();
  if (m.includes("left")) return "corner-up-left";
  if (m.includes("right")) return "corner-up-right";
  return "arrow-up";
}

/**
 * Derive an icon from a RouteStep that only carries `maneuverType` and
 * `instruction` (no explicit modifier field). Falls back to sniffing the
 * first word of the instruction text for left/right cues, which covers
 * OSRM instruction strings like "Turn left", "Slight right", "Sharp left".
 */
export function stepIcon(step: {
  maneuverType: string;
  instruction: string;
}): FeatherIconName {
  const firstWord = step.instruction.split(/\s+/)[0] ?? "";
  return maneuverIcon(step.maneuverType, firstWord);
}
