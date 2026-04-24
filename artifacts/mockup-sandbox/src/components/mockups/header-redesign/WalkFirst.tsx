import { Search, Footprints, Compass, Globe, Navigation, Map, List } from "lucide-react";

const BG = "#0f1117";
const CARD = "#1a1d2b";
const MUTED = "#2d3048";
const FG = "#f0f2ff";
const MUTED_FG = "#8b8fa8";
const PRIMARY = "#6c63ff";
const PRIMARY_FG = "#ffffff";
const BORDER = "#252840";
const WALK_COLOR = "#2ecc8e";

export function WalkFirst() {
  return (
    <div
      style={{
        backgroundColor: BG,
        minHeight: "100vh",
        fontFamily: "'Inter', system-ui, sans-serif",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          backgroundColor: BG,
          borderBottom: `1px solid ${BORDER}`,
          paddingTop: 52,
          paddingBottom: 14,
          paddingLeft: 16,
          paddingRight: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 14,
          }}
        >
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: FG, letterSpacing: "-0.4px" }}>
              Discover
            </div>
            <div style={{ fontSize: 11, color: MUTED_FG, marginTop: 2 }}>
              Midtown Manhattan · ±8m
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Globe size={16} color={MUTED_FG} />
            <Search size={18} color={MUTED_FG} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <div
            style={{
              flex: 1,
              borderRadius: 16,
              backgroundColor: "#152a1e",
              border: `1.5px solid ${WALK_COLOR}55`,
              overflow: "hidden",
              cursor: "pointer",
            }}
          >
            <div
              style={{
                padding: "14px 16px 10px",
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 11,
                  backgroundColor: `${WALK_COLOR}22`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Footprints size={19} color={WALK_COLOR} />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: FG }}>Walk Mode</div>
                <div style={{ fontSize: 10, color: MUTED_FG }}>Audio narration</div>
              </div>
            </div>
            <div
              style={{
                borderTop: `1px solid ${WALK_COLOR}22`,
                padding: "8px 16px",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Navigation size={12} color={WALK_COLOR} />
              <span style={{ fontSize: 11, color: WALK_COLOR, fontWeight: 600 }}>
                Plan a Route
              </span>
            </div>
          </div>

          <div
            style={{
              flex: 1,
              borderRadius: 16,
              backgroundColor: PRIMARY,
              padding: "14px 16px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              cursor: "pointer",
              minHeight: 90,
            }}
          >
            <Compass size={24} color={PRIMARY_FG} />
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: PRIMARY_FG }}>Discover</div>
              <div style={{ fontSize: 10, color: `${PRIMARY_FG}aa` }}>Find nearby</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: "12px 16px" }}>
        <div
          style={{
            display: "flex",
            gap: 8,
            marginBottom: 12,
            alignItems: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              backgroundColor: MUTED,
              borderRadius: 10,
              padding: 2,
              gap: 2,
              marginRight: 4,
            }}
          >
            <div
              style={{
                padding: "5px 10px",
                borderRadius: 8,
                backgroundColor: CARD,
                display: "flex",
                alignItems: "center",
              }}
            >
              <List size={14} color={FG} />
            </div>
            <div
              style={{
                padding: "5px 10px",
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
              }}
            >
              <Map size={14} color={MUTED_FG} />
            </div>
          </div>

          {["150m", "300m", "500m"].map((r, i) => (
            <div
              key={r}
              style={{
                padding: "5px 14px",
                borderRadius: 20,
                backgroundColor: i === 1 ? PRIMARY : MUTED,
                fontSize: 12,
                fontWeight: 600,
                color: i === 1 ? PRIMARY_FG : MUTED_FG,
              }}
            >
              {r}
            </div>
          ))}
        </div>

        {[
          { name: "Chrysler Building", kind: "Skyscraper · 1930" },
          { name: "Grand Central Terminal", kind: "Railway · 1913" },
          { name: "Tudor City", kind: "Residential Complex · 1927" },
        ].map((p, i) => (
          <div
            key={i}
            style={{
              backgroundColor: CARD,
              borderRadius: 14,
              padding: "14px 16px",
              marginBottom: 10,
              border: `1px solid ${BORDER}`,
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 600, color: FG, marginBottom: 4 }}>
              {p.name}
            </div>
            <div style={{ fontSize: 12, color: MUTED_FG }}>{p.kind}</div>
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: 4,
          marginLeft: 16,
          marginRight: 16,
          padding: "10px 14px",
          backgroundColor: "#1e1b2e",
          borderRadius: 12,
          border: `1px solid #3d3660`,
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
        }}
      >
        <span style={{ fontSize: 16 }}>✓</span>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#a89cff" }}>FIX: Walk + Discover equal weight</div>
          <div style={{ fontSize: 11, color: MUTED_FG, marginTop: 2 }}>
            Walk Mode card has built-in "Plan Route" link · No duplicate map icons ·
            Language + search as quiet top-right icons
          </div>
        </div>
      </div>
    </div>
  );
}
