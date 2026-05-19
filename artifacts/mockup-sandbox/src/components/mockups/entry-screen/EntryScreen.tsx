import {
  Compass,
  Headphones,
  Bookmark,
  Search,
  MapPin,
  RefreshCw,
  ChevronRight,
  Navigation,
} from "lucide-react";

const BG = "#081827";
const CARD = "#102537";
const FOREGROUND = "#FFF7E8";
const PRIMARY = "#F2A23A";
const MUTED_FG = "#B8AFC0";
const MUTED = "#1A3144";
const BORDER = "#294055";
const ICON_BG = "rgba(242, 162, 58, 0.094)";
const PRIMARY_FG = "#081827";

function PlaceCard({
  name,
  category,
  distance,
  snippet,
}: {
  name: string;
  category: string;
  distance: string;
  snippet: string;
}) {
  return (
    <div
      style={{
        borderRadius: 14,
        border: `0.5px solid ${BORDER}`,
        backgroundColor: CARD,
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 5,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.7px",
            textTransform: "uppercase",
            color: MUTED_FG,
            fontFamily: "'Inter', sans-serif",
          }}
        >
          {category} · {distance}
        </span>
        <Bookmark size={13} color={MUTED_FG} strokeWidth={1.75} />
      </div>
      <span
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: FOREGROUND,
          fontFamily: "'Inter', sans-serif",
          letterSpacing: "-0.2px",
        }}
      >
        {name}
      </span>
      <span
        style={{
          fontSize: 13,
          color: MUTED_FG,
          fontFamily: "'Inter', sans-serif",
          lineHeight: "18px",
        }}
      >
        {snippet}
      </span>
    </div>
  );
}

function TabBar() {
  return (
    <div
      style={{
        height: 72,
        backgroundColor: BG,
        borderTop: `0.5px solid ${BORDER}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-around",
        paddingBottom: 8,
        flexShrink: 0,
      }}
    >
      {[
        { icon: <Compass size={22} color={PRIMARY} strokeWidth={1.75} />, label: "Explore", active: true },
        { icon: <Headphones size={22} color={MUTED_FG} strokeWidth={1.75} />, label: "Walk", active: false },
        { icon: <Bookmark size={22} color={MUTED_FG} strokeWidth={1.75} />, label: "Saved", active: false },
      ].map(({ icon, label, active }) => (
        <div
          key={label}
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 4,
          }}
        >
          {icon}
          <span
            style={{
              fontSize: 10,
              fontFamily: "'Inter', sans-serif",
              fontWeight: active ? 600 : 400,
              color: active ? PRIMARY : MUTED_FG,
              letterSpacing: "0.3px",
            }}
          >
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}

export function EntryScreen() {
  return (
    <div
      style={{
        width: 390,
        height: 844,
        backgroundColor: BG,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      {/* Status bar */}
      <div style={{ height: 44, flexShrink: 0 }} />

      {/* Header */}
      <div
        style={{
          paddingLeft: 20,
          paddingRight: 20,
          paddingBottom: 12,
          borderBottom: `0.5px solid ${BORDER}`,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 2,
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.8px",
              color: MUTED_FG,
            }}
          >
            Chelsea · ±18m
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 10,
                backgroundColor: MUTED,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Search size={15} color={FOREGROUND} strokeWidth={2} />
            </div>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 10,
                backgroundColor: PRIMARY,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Compass size={17} color={PRIMARY_FG} strokeWidth={2.25} />
            </div>
          </div>
        </div>
        <span
          style={{
            fontSize: 26,
            fontWeight: 700,
            color: FOREGROUND,
            letterSpacing: "-0.5px",
            display: "block",
          }}
        >
          Explore
        </span>
        <span
          style={{
            fontSize: 13,
            color: MUTED_FG,
            fontWeight: 400,
            marginTop: 1,
            display: "block",
            fontStyle: "italic",
          }}
        >
          Small stories hidden in ordinary places.
        </span>
      </div>

      {/* Radius chips */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 20px",
          borderBottom: `0.5px solid ${BORDER}`,
          flexShrink: 0,
        }}
      >
        <span
          style={{ fontSize: 11, color: MUTED_FG, fontWeight: 500, flexShrink: 0 }}
        >
          Range
        </span>
        {[
          { label: "Close · 150m", active: false },
          { label: "Near · 300m", active: true },
          { label: "Wide · 500m", active: false },
        ].map(({ label, active }) => (
          <div
            key={label}
            style={{
              borderRadius: 20,
              paddingLeft: 10,
              paddingRight: 10,
              paddingTop: 5,
              paddingBottom: 5,
              backgroundColor: active ? FOREGROUND : MUTED,
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: active ? BG : MUTED_FG,
              }}
            >
              {label}
            </span>
          </div>
        ))}
      </div>

      {/* Place list */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "12px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <PlaceCard
          name="The High Line"
          category="Landmark"
          distance="180m"
          snippet="Opened in 2009 on an abandoned rail spur, this elevated park transformed Chelsea's western edge."
        />
        <PlaceCard
          name="Starrett-Lehigh Building"
          category="Architecture"
          distance="260m"
          snippet="Built in 1931, its continuous horizontal windows were radical — the entire facade was glass and concrete ribbon."
        />
        <PlaceCard
          name="London Terrace"
          category="Residential"
          distance="390m"
          snippet="This 1930 mega-block housed 1,600 apartments and its own post office when it opened."
        />

        {/* Walk entry banner */}
        <div
          style={{
            marginTop: 4,
            borderRadius: 14,
            border: `0.5px solid ${PRIMARY}40`,
            backgroundColor: `${PRIMARY}14`,
            padding: "14px 16px",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: ICON_BG,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Headphones size={18} color={PRIMARY} strokeWidth={1.75} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: FOREGROUND }}>
              Start listening nearby
            </div>
            <div style={{ fontSize: 12, color: MUTED_FG, marginTop: 1 }}>
              Wander or plan a route with audio
            </div>
          </div>
          <ChevronRight size={16} color={PRIMARY} strokeWidth={2} />
        </div>

        <div style={{ height: 8 }} />
      </div>

      <TabBar />
    </div>
  );
}
