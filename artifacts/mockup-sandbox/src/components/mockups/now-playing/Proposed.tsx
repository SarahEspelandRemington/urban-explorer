const dark = {
  background: "#081827",
  card: "#102537",
  border: "#294055",
  borderLeft: "#F2A23A",
  primary: "#F2A23A",
  foreground: "#FFF7E8",
  mutedForeground: "#B8AFC0",
  muted: "#1A3144",
};

function IconInfo({ size = 16, color = "#F2A23A" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

function IconPause({ size = 18, color = "#F2A23A" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="6" y="4" width="4" height="16" />
      <rect x="14" y="4" width="4" height="16" />
    </svg>
  );
}

function IconSkip({ size = 18, color = "#F2A23A" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="5 4 15 12 5 20 5 4" />
      <line x1="19" y1="5" x2="19" y2="19" />
    </svg>
  );
}

const iconBtn: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 12,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: dark.primary + "18",
  border: "none",
  cursor: "pointer",
  flexShrink: 0,
};

export function Proposed() {
  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: dark.background,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div style={{ width: 420 }}>
        <p
          style={{
            color: dark.mutedForeground,
            fontSize: 11,
            fontFamily: "system-ui, sans-serif",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            marginBottom: 8,
            marginLeft: 4,
          }}
        >
          Proposed state
        </p>
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            padding: "14px 14px",
            borderRadius: 16,
            border: `1px solid ${dark.border}`,
            borderLeft: `3px solid ${dark.borderLeft}`,
            backgroundColor: dark.card,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <p
              style={{
                margin: 0,
                fontSize: 11,
                fontFamily: "system-ui, sans-serif",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: dark.mutedForeground,
              }}
            >
              Now Playing
            </p>
            <p
              style={{
                margin: "2px 0 0",
                fontSize: 15,
                fontWeight: 600,
                fontFamily: "system-ui, sans-serif",
                color: dark.foreground,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              Independence Hall
            </p>
          </div>

          <button style={iconBtn}>
            <IconInfo size={16} color={dark.primary} />
          </button>
          <button style={iconBtn}>
            <IconPause size={18} color={dark.primary} />
          </button>
          <button style={iconBtn}>
            <IconSkip size={18} color={dark.primary} />
          </button>
        </div>
      </div>
    </div>
  );
}
