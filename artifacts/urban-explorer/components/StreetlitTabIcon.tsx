import { Path, Svg } from "react-native-svg";

interface TabIconProps {
  color: string;
  size: number;
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
