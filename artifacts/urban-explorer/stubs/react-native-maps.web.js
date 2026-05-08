import React from "react";
import { View } from "react-native";

const noop = () => null;

const MapView = React.forwardRef(function MapView(
  { style, children, ...rest },
  ref,
) {
  return React.createElement(
    View,
    { ref, style: [{ flex: 1, backgroundColor: "#e5e5e5" }, style] },
    null,
  );
});

MapView.Animated = MapView;

export const Marker = noop;
export const Callout = noop;
export const Circle = noop;
export const Polyline = noop;
export const Polygon = noop;
export const Overlay = noop;

export const PROVIDER_DEFAULT = null;
export const PROVIDER_GOOGLE = null;

export default MapView;
