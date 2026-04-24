import AsyncStorage from "@react-native-async-storage/async-storage";

const DISCOVERY_KEY = "custom_loading_messages_discovery";
const DETAIL_KEY = "custom_loading_messages_detail";

export interface CustomMessages {
  discovery: string[] | null;
  detail: string[] | null;
}

export async function loadCustomMessages(): Promise<CustomMessages> {
  const [discovery, detail] = await Promise.all([
    AsyncStorage.getItem(DISCOVERY_KEY),
    AsyncStorage.getItem(DETAIL_KEY),
  ]);
  return {
    discovery: discovery ? JSON.parse(discovery) : null,
    detail: detail ? JSON.parse(detail) : null,
  };
}

export async function saveCustomMessages(
  variant: "discovery" | "detail",
  messages: string[]
): Promise<void> {
  const key = variant === "discovery" ? DISCOVERY_KEY : DETAIL_KEY;
  await AsyncStorage.setItem(key, JSON.stringify(messages));
}

export async function clearCustomMessages(variant: "discovery" | "detail"): Promise<void> {
  const key = variant === "discovery" ? DISCOVERY_KEY : DETAIL_KEY;
  await AsyncStorage.removeItem(key);
}
