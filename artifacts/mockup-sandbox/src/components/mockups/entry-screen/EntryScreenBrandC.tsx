import { Compass, Headphones } from "lucide-react";

const BG = "#081827";
const CARD = "#102537";
const FOREGROUND = "#FFF7E8";
const PRIMARY = "#F2A23A";
const MUTED_FG = "#B8AFC0";
const BORDER = "#1E3550";
const ICON_BG = "rgba(242,162,58,0.10)";

function ModeCard({
  icon,
  modeLabel,
  headline,
  subcopy,
  accent,
}: {
  icon: React.ReactNode;
  modeLabel: string;
  headline: string;
  subcopy: string;
  accent?: boolean;
}) {
  return (
    <div
      style={{
        backgroundColor: CARD,
        borderRadius: 18,
        border: `1px solid ${accent ? PRIMARY + "55" : BORDER}`,
        padding: "18px 20px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        boxShadow: accent
          ? `0 0 0 1px ${PRIMARY}18, 0 4px 20px rgba(0,0,0,0.28)`
          : "0 2px 12px rgba(0,0,0,0.22)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 9,
            backgroundColor: accent ? PRIMARY + "22" : ICON_BG,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            border: `1px solid ${PRIMARY}30`,
          }}
        >
          {icon}
        </div>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "1.2px",
            textTransform: "uppercase",
            color: PRIMARY,
            fontFamily: "'Inter', sans-serif",
          }}
        >
          {modeLabel}
        </span>
      </div>
      <span
        style={{
          fontSize: 18,
          fontWeight: 700,
          color: FOREGROUND,
          fontFamily: "'Inter', sans-serif",
          letterSpacing: "-0.3px",
          lineHeight: "24px",
        }}
      >
        {headline}
      </span>
      <span
        style={{
          fontSize: 13,
          color: MUTED_FG,
          fontFamily: "'Inter', sans-serif",
          lineHeight: "19px",
          fontStyle: "italic",
        }}
      >
        {subcopy}
      </span>
    </div>
  );
}

function StreetlampMark({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block", flexShrink: 0 }}
    >
      {/* pole */}
      <rect
        x="9.25"
        y="8"
        width="1.5"
        height="10"
        rx="0.75"
        fill="#F2A23A"
        opacity="0.9"
      />
      {/* arm */}
      <path
        d="M10 9 Q10 5.5 6.5 5.5"
        stroke="#F2A23A"
        strokeWidth="1.4"
        strokeLinecap="round"
        fill="none"
        opacity="0.9"
      />
      {/* lamp head */}
      <ellipse cx="6.5" cy="5.5" rx="2" ry="1.2" fill="#F2A23A" />
      {/* glow dots */}
      <circle cx="6.5" cy="3.8" r="0.7" fill="#F2A23A" opacity="0.35" />
      <circle cx="6.5" cy="3.0" r="0.45" fill="#F2A23A" opacity="0.18" />
    </svg>
  );
}

export function EntryScreenBrandC() {
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
      <div style={{ height: 52, flexShrink: 0 }} />

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "0 24px 32px",
          overflowY: "auto",
        }}
      >
        <div style={{ height: 40 }} />

        {/* ── C: Small accent mark inline with wordmark ─────────────── */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
          }}
        >
          <StreetlampMark size={28} />
          <span
            style={{
              fontSize: 36,
              fontWeight: 700,
              color: FOREGROUND,
              fontFamily: "'Inter', sans-serif",
              letterSpacing: "-0.9px",
              lineHeight: "36px",
            }}
          >
            Streetlit
          </span>
        </div>

        <div style={{ height: 10 }} />

        {/* ── Tagline ────────────────────────────────────────────── */}
        <span
          style={{
            fontSize: 13,
            fontWeight: 400,
            color: MUTED_FG,
            fontFamily: "'Inter', sans-serif",
            letterSpacing: "0.1px",
            fontStyle: "italic",
          }}
        >
          Walk curious.
        </span>

        <div style={{ height: 36 }} />

        <ModeCard
          icon={<Compass size={16} color={PRIMARY} strokeWidth={2} />}
          modeLabel="Explore"
          headline="See what's around me."
          subcopy="Browse the hidden layers of a place."
        />

        <div style={{ height: 12 }} />

        <ModeCard
          icon={<Headphones size={16} color={PRIMARY} strokeWidth={2} />}
          modeLabel="Walk"
          headline="Go for a walk."
          subcopy="Listen to the city unfold around you."
          accent
        />

        <div style={{ height: 24 }} />

        <span
          style={{
            fontSize: 13,
            color: MUTED_FG,
            fontFamily: "'Inter', sans-serif",
            textDecorationLine: "underline",
            textDecorationColor: MUTED_FG + "55",
            opacity: 0.75,
          }}
        >
          Search for a location
        </span>
      </div>
    </div>
  );
}
