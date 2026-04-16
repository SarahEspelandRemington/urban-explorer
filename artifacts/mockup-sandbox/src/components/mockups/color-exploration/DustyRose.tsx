import { Landmark, Search, Headphones, Navigation, Bookmark } from "lucide-react";

const colors = {
  background: "#F5F2F3",
  card: "#FFFFFF",
  foreground: "#352A2E",
  mutedForeground: "#6B5C62",
  primary: "#8B5C6B",
  primaryForeground: "#FFFFFF",
  border: "#E0D6DA",
  muted: "#EDE8EB",
};

export function DustyRose() {
  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: colors.background,
        display: "flex",
        flexDirection: "column",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "40px 24px",
          gap: 24,
        }}
      >
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: 24,
            backgroundColor: colors.primary + "18",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Landmark size={40} color={colors.primary} strokeWidth={1.5} />
        </div>

        <div style={{ textAlign: "center" }}>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 700,
              color: colors.foreground,
              margin: "0 0 8px",
              letterSpacing: -0.5,
            }}
          >
            Enable Location
          </h1>
          <p
            style={{
              fontSize: 15,
              color: colors.mutedForeground,
              margin: 0,
              lineHeight: 1.5,
              maxWidth: 300,
            }}
          >
            Urban Explorer needs your location to discover interesting buildings
            and historical sites near you.
          </p>
        </div>

        <div
          style={{
            width: "100%",
            maxWidth: 340,
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <button
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              width: "100%",
              padding: "16px 24px",
              borderRadius: 14,
              border: "none",
              backgroundColor: colors.primary,
              color: colors.primaryForeground,
              fontSize: 16,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            <Navigation size={18} />
            Allow Location Access
          </button>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              color: colors.mutedForeground,
              fontSize: 13,
            }}
          >
            <div
              style={{
                flex: 1,
                height: 1,
                backgroundColor: colors.border,
              }}
            />
            <span>or</span>
            <div
              style={{
                flex: 1,
                height: 1,
                backgroundColor: colors.border,
              }}
            />
          </div>

          <button
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              width: "100%",
              padding: "16px 24px",
              borderRadius: 14,
              border: `1px solid ${colors.border}`,
              backgroundColor: colors.card,
              color: colors.foreground,
              fontSize: 16,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            <Search size={18} />
            Search by Location
          </button>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              color: colors.mutedForeground,
              fontSize: 13,
            }}
          >
            <div
              style={{
                flex: 1,
                height: 1,
                backgroundColor: colors.border,
              }}
            />
            <span>or</span>
            <div
              style={{
                flex: 1,
                height: 1,
                backgroundColor: colors.border,
              }}
            />
          </div>

          <button
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              width: "100%",
              padding: "16px 24px",
              borderRadius: 14,
              border: "none",
              backgroundColor: colors.primary,
              color: colors.primaryForeground,
              fontSize: 16,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            <Headphones size={18} />
            <div style={{ textAlign: "left" }}>
              <div>Walk Mode</div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 400,
                  opacity: 0.75,
                  marginTop: 2,
                }}
              >
                Skip ahead — explore on foot with audio
              </div>
            </div>
          </button>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-around",
          padding: "12px 0 28px",
          borderTop: `1px solid ${colors.border}`,
          backgroundColor: colors.background,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 4,
          }}
        >
          <Landmark size={22} color={colors.primary} strokeWidth={1.8} />
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: colors.primary,
            }}
          >
            Explore
          </span>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 4,
          }}
        >
          <Bookmark size={22} color={colors.mutedForeground} strokeWidth={1.8} />
          <span
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: colors.mutedForeground,
            }}
          >
            Saved
          </span>
        </div>
      </div>
    </div>
  );
}
