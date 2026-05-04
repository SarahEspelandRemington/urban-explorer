/**
 * Auth-session-free constants. Imported by `lib/auth.tsx` (mounted at the
 * root of the cold-start critical path) so that `AuthProvider` does not
 * have to pull in `expo-auth-session` / `expo-web-browser` to learn the
 * SecureStore key. Those modules stay scoped to `lib/loginFlow.ts` (which
 * is only imported by the Login screen).
 */
export const AUTH_TOKEN_STORAGE_KEY = "auth_session_token";
