import * as AuthSession from "expo-auth-session";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useState } from "react";

import { AUTH_TOKEN_STORAGE_KEY } from "./authConstants";

WebBrowser.maybeCompleteAuthSession();

const AUTH_TOKEN_KEY = AUTH_TOKEN_STORAGE_KEY;
const ISSUER_URL =
  process.env.EXPO_PUBLIC_ISSUER_URL ?? "https://replit.com/oidc";

function getApiBaseUrl(): string {
  if (process.env.EXPO_PUBLIC_DOMAIN) {
    return `https://${process.env.EXPO_PUBLIC_DOMAIN}`;
  }
  return "";
}

function getClientId(): string {
  return process.env.EXPO_PUBLIC_REPL_ID || "";
}

interface LoginFlowResult {
  /** Trigger the OIDC login prompt. Resolves when the system browser closes. */
  login: () => Promise<void>;
  /** True while the OIDC discovery / token-exchange round-trip is in flight. */
  isExchangingToken: boolean;
  /** True if we're still waiting for OIDC discovery to resolve. */
  isDiscovering: boolean;
}

/**
 * Hook that owns every piece of OIDC flow state.
 *
 * This is intentionally NOT used by the root provider so that the
 * `AuthSession.useAutoDiscovery(ISSUER_URL)` network call — which fires
 * eagerly on every app launch — does not block cold-start. The login screen
 * mounts only when the user actually needs it.
 *
 * @param onSuccess Called once a token has been persisted. The caller (the
 *                  AuthProvider) refreshes the user state from /api/auth/user.
 */
export function useLoginFlow(
  onSuccess: () => Promise<void> | void,
): LoginFlowResult {
  const discovery = AuthSession.useAutoDiscovery(ISSUER_URL);
  const redirectUri = AuthSession.makeRedirectUri();
  const [isExchangingToken, setIsExchangingToken] = useState(false);

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: getClientId(),
      scopes: ["openid", "email", "profile", "offline_access"],
      redirectUri,
      prompt: AuthSession.Prompt.Login,
    },
    discovery,
  );

  useEffect(() => {
    if (response?.type !== "success" || !request?.codeVerifier) return;
    const { code, state } = response.params;

    let cancelled = false;
    setIsExchangingToken(true);
    (async () => {
      try {
        const apiBase = getApiBaseUrl();
        if (!apiBase) {
          console.error("API base URL is not configured.");
          return;
        }
        const exchangeRes = await fetch(
          `${apiBase}/api/mobile-auth/token-exchange`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              code,
              code_verifier: request.codeVerifier,
              redirect_uri: redirectUri,
              state,
            }),
          },
        );
        if (!exchangeRes.ok) {
          console.error("Token exchange failed:", exchangeRes.status);
          return;
        }
        const data = await exchangeRes.json();
        if (data?.token) {
          await SecureStore.setItemAsync(AUTH_TOKEN_KEY, data.token);
          if (!cancelled) await onSuccess();
        }
      } catch (err) {
        console.error("Token exchange error:", err);
      } finally {
        if (!cancelled) setIsExchangingToken(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [response, request, redirectUri, onSuccess]);

  const login = useCallback(async () => {
    try {
      await promptAsync();
    } catch (err) {
      console.error("Login error:", err);
    }
  }, [promptAsync]);

  return {
    login,
    isExchangingToken,
    isDiscovering: discovery == null,
  };
}
