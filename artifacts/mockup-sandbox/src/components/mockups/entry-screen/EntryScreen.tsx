import {
  Compass,
  Headphones,
  Bookmark,
  Search,
  ChevronRight,
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

function AnchorCard({
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
        borderRadius: 16,
        border: `0.5px solid ${BORDER}`,
        backgroundColor: "#132D42",
        padding: "18px 18px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 7,
        boxShadow:
          "0 0 0 1px rgba(242,162,58,0.07), 0 4px 20px rgba(0,0,0,0.28)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: PRIMARY,
              opacity: 0.85,
            }}
          />
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.7px",
              textTransform: "uppercase",
              color: PRIMARY,
              opacity: 0.8,
              fontFamily: "'Inter', sans-serif",
            }}
          >
            {distance} away
          </span>
        </div>
        <Bookmark size={13} color={MUTED_FG} strokeWidth={1.75} />
      </div>
      <span
        style={{
          fontSize: 18,
          fontWeight: 700,
          color: FOREGROUND,
          fontFamily: "'Inter', sans-serif",
          letterSpacing: "-0.35px",
          lineHeight: "24px",
        }}
      >
        {name}
      </span>
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.6px",
          textTransform: "uppercase",
          color: MUTED_FG,
          opacity: 0.7,
          fontFamily: "'Inter', sans-serif",
        }}
      >
        {category}
      </span>
      <span
        style={{
          fontSize: 13,
          color: MUTED_FG,
          fontFamily: "'Inter', sans-serif",
          lineHeight: "20px",
          marginTop: 2,
        }}
      >
        {snippet}
      </span>
    </div>
  );
}

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
        padding: "13px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.7px",
            textTransform: "uppercase",
            color: MUTED_FG,
            opacity: 0.7,
            fontFamily: "'Inter', sans-serif",
          }}
        >
          {category} · {distance}
        </span>
        <Bookmark size={12} color={MUTED_FG} strokeWidth={1.75} />
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
          fontSize: 12,
          color: MUTED_FG,
          fontFamily: "'Inter', sans-serif",
          lineHeight: "18px",
          opacity: 0.85,
        }}
      >
        {snippet}
      </span>
    </div>
  );
}

function WalkBanner() {
  return (
    <div
      style={{
        borderRadius: 13,
        border: `0.5px solid ${PRIMARY}30`,
        backgroundColor: `${PRIMARY}0f`,
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: 17,
          backgroundColor: ICON_BG,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Headphones size={16} color={PRIMARY} strokeWidth={1.75} />
      </div>
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: FOREGROUND,
            fontFamily: "'Inter', sans-serif",
          }}
        >
          Start listening nearby
        </div>
        <div
          style={{
            fontSize: 12,
            color: MUTED_FG,
            marginTop: 1,
            fontFamily: "'Inter', sans-serif",
            opacity: 0.85,
          }}
        >
          Wander or plan a route with audio
        </div>
      </div>
      <ChevronRight size={15} color={PRIMARY} strokeWidth={2} opacity={0.7} />
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
        {
          icon: <Compass size={22} color={PRIMARY} strokeWidth={1.75} />,
          label: "Explore",
          active: true,
        },
        {
          icon: <Headphones size={22} color={MUTED_FG} strokeWidth={1.75} />,
          label: "Walk",
          active: false,
        },
        {
          icon: <Bookmark size={22} color={MUTED_FG} strokeWidth={1.75} />,
          label: "Saved",
          active: false,
        },
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
            marginBottom: 4,
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.8px",
              color: MUTED_FG,
              opacity: 0.75,
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
            marginTop: 2,
            display: "block",
            fontStyle: "italic",
            opacity: 0.8,
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
          style={{
            fontSize: 11,
            color: MUTED_FG,
            fontWeight: 500,
            opacity: 0.7,
            flexShrink: 0,
          }}
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

      {/* Scrollable content area */}
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
        {/* Walk banner — above the list */}
        <WalkBanner />

        {/* Anchor card — nearest/most relevant, slightly elevated */}
        <AnchorCard
          name="The High Line"
          category="Landmark"
          distance="180m"
          snippet="Opened in 2009 on an abandoned 1934 freight rail spur. The rusted infrastructure became a model for adaptive reuse in cities worldwide."
        />

        {/* Standard cards */}
        <PlaceCard
          name="Starrett-Lehigh Building"
          category="Architecture"
          distance="260m"
          snippet="Its 1931 ribbon windows were radical. The whole facade was continuous glass and concrete — rail cars once drove inside to load goods."
        />
        <PlaceCard
          name="London Terrace"
          category="Residential"
          distance="390m"
          snippet="This 1930 mega-block housed 1,600 apartments, its own post office, and a rooftop pool. Doormen wore London bobby uniforms."
        />

        <div style={{ height: 8 }} />
      </div>

      <TabBar />
    </div>
  );
}
