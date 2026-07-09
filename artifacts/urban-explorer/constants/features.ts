// Feature flags for gating UI surfaces without deleting the underlying code.
// Set to true to re-enable the ratings UI (thumbs up/down, community score,
// rate-pace warning). Server-side rating endpoints are unaffected by this flag.
export const RATINGS_ENABLED = false;

// Set to true to re-enable the /login screen and OIDC login flow. Ratings
// were the only real consumer of login (cross-device rating sync); with
// ratings hidden, login has no active purpose. Server-side auth endpoints
// have their own independent guard in artifacts/api-server/src/routes/auth.ts.
export const AUTH_ENABLED = false;
