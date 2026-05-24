const light = {
  background: "#FFF8EE",
  card: "#FFFFFF",
  border: "#E7D4C0",
  borderLeft: "#E98D32",
  primary: "#E98D32",
  foreground: "#102033",
  mutedForeground: "#6F6372",
  muted: "#F4E6D6",
};

function IconHeadphones({ size = 18, color = "#E98D32" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
      <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3z" />
      <path d="M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
    </svg>
  );
}

function IconInfo({ size = 16, color = "#6F6372" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

function IconPause({ size = 18, color = "#102033" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="6" y="4" width="4" height="16" />
      <rect x="14" y="4" width="4" height="16" />
    </svg>
  );
}

function IconSkip({ size = 18, color = "#102033" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
  backgroundColor: light.muted,
  border: "none",
  cursor: "pointer",
  flexShrink: 0,
};

export function CurrentLight() {
  return (
    <div style={{ minHeight: "100vh", backgroundColor: light.background, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: 420 }}>
        <p style={{ color: light.mutedForeground, fontSize: 11, fontFamily: "system-ui, sans-serif", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8, marginLeft: 4 }}>
          Current state
        </p>
        <div style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          padding: "14px 14px",
          borderRadius: 16,
          border: `1px solid ${light.border}`,
          borderLeft: `3px solid ${light.borderLeft}`,
          backgroundColor: light.card,
        }}>
          <div style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            backgroundColor: light.primary + "18",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}>
            <IconHeadphones size={18} color={light.primary} />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 11, fontFamily: "system-ui, sans-serif", textTransform: "uppercase", letterSpacing: "0.05em", color: light.mutedForeground }}>
              Now Playing
            </p>
            <p style={{ margin: "2px 0 0", fontSize: 15, fontWeight: 600, fontFamily: "system-ui, sans-serif", color: light.foreground, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              Independence Hall
            </p>
          </div>

          <button style={iconBtn}>
            <IconInfo size={16} color={light.mutedForeground} />
          </button>
          <button style={iconBtn}>
            <IconPause size={18} color={light.foreground} />
          </button>
          <button style={iconBtn}>
            <IconSkip size={18} color={light.foreground} />
          </button>
        </div>
      </div>
    </div>
  );
}
