import { List, Map, Search, Navigation, Footprints, Compass, Globe, ChevronDown } from "lucide-react";

const BG = "#0f1117";
const CARD = "#1a1d2b";
const MUTED = "#2d3048";
const FG = "#f0f2ff";
const MUTED_FG = "#8b8fa8";
const PRIMARY = "#6c63ff";
const PRIMARY_FG = "#ffffff";
const BORDER = "#252840";

function IconBtn({
  icon: Icon,
  label,
  active = false,
  primary = false,
}: {
  icon: any;
  label: string;
  active?: boolean;
  primary?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        padding: "8px 10px",
        borderRadius: 12,
        backgroundColor: primary ? PRIMARY : active ? "#252840" : MUTED,
        cursor: "pointer",
        minWidth: 48,
      }}
    >
      <Icon size={18} color={primary ? PRIMARY_FG : active ? FG : MUTED_FG} />
      <span
        style={{
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: "0.03em",
          color: primary ? PRIMARY_FG : active ? FG : MUTED_FG,
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
    </div>
  );
}

function ToggleGroup() {
  return (
    <div
      style={{
        display: "flex",
        backgroundColor: MUTED,
        borderRadius: 10,
        padding: 2,
        gap: 2,
      }}
    >
      <div
        style={{
          padding: "7px 10px",
          borderRadius: 8,
          backgroundColor: CARD,
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        <List size={15} color={FG} />
        <span style={{ fontSize: 9, fontWeight: 600, color: FG }}>List</span>
      </div>
      <div
        style={{
          padding: "7px 10px",
          borderRadius: 8,
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        <Map size={15} color={MUTED_FG} />
        <span style={{ fontSize: 9, fontWeight: 600, color: MUTED_FG }}>Map</span>
      </div>
    </div>
  );
}

export function LabeledActions() {
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
          paddingBottom: 12,
          paddingLeft: 16,
          paddingRight: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 10,
          }}
        >
          <span style={{ fontSize: 12, color: MUTED_FG, fontWeight: 500 }}>
            Midtown Manhattan · ±8m
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Globe size={13} color={MUTED_FG} />
            <span style={{ fontSize: 11, color: MUTED_FG, fontWeight: 500 }}>EN</span>
            <ChevronDown size={12} color={MUTED_FG} />
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span style={{ fontSize: 24, fontWeight: 700, color: FG, letterSpacing: "-0.5px" }}>
            Discover
          </span>

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <ToggleGroup />
            <IconBtn icon={Search} label="Search" />
            <IconBtn icon={Navigation} label="Plan Walk" />
            <IconBtn icon={Footprints} label="Walk" />
            <IconBtn icon={Compass} label="Discover" primary />
          </div>
        </div>
      </div>

      <div style={{ padding: "14px 16px" }}>
        <div
          style={{
            display: "flex",
            gap: 8,
            marginBottom: 12,
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: 12, color: MUTED_FG, fontWeight: 500 }}>Range:</span>
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
          marginTop: 8,
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
          <div style={{ fontSize: 12, fontWeight: 700, color: "#a89cff" }}>FIX: Duplicate icons gone</div>
          <div style={{ fontSize: 11, color: MUTED_FG, marginTop: 2 }}>
            "Plan Walk" uses a navigation arrow · "Walk" uses a footprints icon ·
            Language is subtle text chip in location row · Labels on all buttons
          </div>
        </div>
      </div>
    </div>
  );
}
