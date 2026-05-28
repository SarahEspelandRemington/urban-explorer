import { Circle, Path, Svg } from "react-native-svg";

interface TabIconProps {
  color: string;
  size: number;
}

export function ExploreTabIcon({ color, size }: TabIconProps) {
  return (
    <Svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke={color}
      strokeWidth={2.25}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="M5.2 18.8L9.3 6.2l9.5-1-4.1 12.6-9.5 1Z" />
      <Path d="M10.4 13.6l3.2-3.2" />
    </Svg>
  );
}

export function WalkTabIcon({ color, size }: TabIconProps) {
  return (
    <Svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke={color}
      strokeWidth={2.25}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="M5.9 18.2H10.3c1.5 0 2.7-1.2 2.7-2.7s-1.2-2.7-2.7-2.7H7.7c-1.5 0-2.7-1.2-2.7-2.7s1.2-2.7 2.7-2.7h5.9" />
      <Path d="M13.6 7.4h2.3c1.6 0 2.9-1.3 2.9-2.9V3.1" />
      <Circle cx={12} cy={7.4} r={1.8} />
      <Path d="M12 3.7V2.3" />
      <Path d="M9 4.5L8 3.5" />
      <Path d="M15 4.5L16 3.5" />
    </Svg>
  );
}

export function SavedTabIcon({ color, size }: TabIconProps) {
  return (
    <Svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke={color}
      strokeWidth={2.25}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="M7 4.8c0-1 .8-1.8 1.8-1.8h6.4c1 0 1.8.8 1.8 1.8v15.4l-5-3.4-5 3.4V4.8Z" />
    </Svg>
  );
}
