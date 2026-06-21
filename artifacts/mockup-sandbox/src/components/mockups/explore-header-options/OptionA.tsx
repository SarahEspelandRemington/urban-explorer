/**
 * Option A — Mode Title + Button Shelf
 *
 * "Explore" replaces the streetlit wordmark.
 * All action buttons move to their own contained row below the title.
 * The Dbg chip is reduced to a tiny faded indicator tucked at the far right
 * of the button shelf so it stays accessible in dev without stealing space.
 */

export function OptionA() {
  return (
    <div
      style={{
        fontFamily: "-apple-system, 'Inter', 'Segoe UI', sans-serif",
        background: "#081827",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ── Header ─────────────────────────────────────────────── */}
      <div
        style={{
          background: "#081827",
          borderBottom: "1px solid #294055",
          paddingTop: 54,
          paddingBottom: 12,
          paddingLeft: 20,
          paddingRight: 20,
        }}
      >
        {/* Row 1: Location meta + globe */}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 10,
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              color: "#B8AFC0",
              flex: 1,
            }}
          >
            Spring Garden, Philadelphia&nbsp;&nbsp;·&nbsp;&nbsp;±5m
          </span>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 14,
              background: "#1A3144",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: 13, color: "#B8AFC0" }}>🌐</span>
          </div>
        </div>

        {/* Row 2: Mode title */}
        <div style={{ marginBottom: 3 }}>
          <span
            style={{
              fontSize: 30,
              fontWeight: 700,
              letterSpacing: -0.5,
              color: "#FFF7E8",
              lineHeight: 1.1,
            }}
          >
            Explore
          </span>
        </div>

        {/* Row 3: Tagline */}
        <p
          style={{
            fontSize: 12,
            color: "#B8AFC0",
            margin: "0 0 12px 0",
            lineHeight: 1.4,
          }}
        >
          Small stories hidden in ordinary places.
        </p>

        {/* Row 4: Button shelf — all controls in one row */}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
          }}
        >
          {/* List / Map toggle */}
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              background: "#1A3144",
              borderRadius: 10,
              padding: 3,
              gap: 0,
            }}
          >
            <button
              style={{
                width: 38,
                height: 36,
                borderRadius: 8,
                border: "none",
                background: "#102537",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ListIcon />
            </button>
            <button
              style={{
                width: 38,
                height: 36,
                borderRadius: 8,
                border: "none",
                background: "transparent",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <MapIcon color="#B8AFC0" />
            </button>
          </div>

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Compass (primary action — orange) */}
          <button
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              border: "none",
              background: "#F2A23A",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <CompassIcon color="#081827" />
          </button>

          {/* Map-pin */}
          <button
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              border: "none",
              background: "#1A3144",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <MapPinIcon />
          </button>

          {/* Search */}
          <button
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              border: "none",
              background: "#1A3144",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <SearchIcon />
          </button>

          {/* Dbg — tiny, faded, dev-only */}
          <div
            style={{
              padding: "3px 6px",
              borderRadius: 5,
              border: "1px solid #294055",
              background: "#0a1f30",
              opacity: 0.55,
            }}
          >
            <span
              style={{
                fontSize: 9,
                fontWeight: 600,
                color: "#B8AFC0",
                letterSpacing: 0.3,
              }}
            >
              DBG
            </span>
          </div>
        </div>
      </div>

      {/* ── Range row ───────────────────────────────────────────── */}
      <RangeRow active={300} />

      {/* ── Faint content hint ──────────────────────────────────── */}
      <ContentHint />
    </div>
  );
}

function RangeRow({ active }: { active: 150 | 300 | 500 }) {
  const chips: { label: string; value: 150 | 300 | 500 }[] = [
    { label: "Close · 150m", value: 150 },
    { label: "Medium · 300m", value: 300 },
    { label: "Wide · 500m", value: 500 },
  ];
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingLeft: 16,
        paddingRight: 16,
        paddingTop: 8,
        paddingBottom: 8,
        borderBottom: "1px solid #294055",
        background: "#081827",
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: 0.4,
          textTransform: "uppercase",
          color: "#B8AFC0",
          marginRight: 4,
        }}
      >
        Range
      </span>
      {chips.map((c) => (
        <div
          key={c.value}
          style={{
            paddingLeft: 10,
            paddingRight: 10,
            paddingTop: 6,
            paddingBottom: 6,
            borderRadius: 8,
            background: c.value === active ? "#FFF7E8" : "#1A3144",
            cursor: "pointer",
          }}
        >
          <span
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: c.value === active ? "#081827" : "#B8AFC0",
            }}
          >
            {c.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function ContentHint() {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: 16,
        opacity: 0.25,
      }}
    >
      {[90, 110, 90].map((h, i) => (
        <div
          key={i}
          style={{
            height: h,
            borderRadius: 12,
            background: "#1A3144",
          }}
        />
      ))}
    </div>
  );
}

function ListIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#FFF7E8"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}
function MapIcon({ color = "#FFF7E8" }: { color?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
      <line x1="8" y1="2" x2="8" y2="18" />
      <line x1="16" y1="6" x2="16" y2="22" />
    </svg>
  );
}
function CompassIcon({ color = "#081827" }: { color?: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
    </svg>
  );
}
function MapPinIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#FFF7E8"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}
function SearchIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#FFF7E8"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}
