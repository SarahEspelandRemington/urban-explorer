import * as SecureStore from "expo-secure-store";

const AUTH_TOKEN_KEY = "auth_session_token";

export async function getApiToken(): Promise<string | null> {
  return SecureStore.getItemAsync(AUTH_TOKEN_KEY);
}

export async function authHeaders(): Promise<Record<string, string>> {
  const token = await getApiToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
