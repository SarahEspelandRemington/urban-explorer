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
      {/* Icon + mode label — visually bonded */}
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

      {/* Bold action headline */}
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

      {/* Soft explanatory line */}
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

export function EntryScreenProposed() {
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
        <div style={{ height: 24 }} />

        {/* ── Brand mark (app icon tile) ──────────────────────────── */}
        <img
          src="/__mockup/images/streetlit-icon.png"
          width={72}
          height={72}
          style={{ borderRadius: 18, objectFit: "cover" }}
          alt="Streetlit"
        />

        <div style={{ height: 14 }} />

        {/* ── App name ───────────────────────────────────────────── */}
        <span
          style={{
            fontSize: 28,
            fontWeight: 700,
            color: PRIMARY,
            fontFamily: "'Inter', sans-serif",
            letterSpacing: "-0.6px",
            lineHeight: "34px",
          }}
        >
          Streetlit
        </span>

        <div style={{ height: 6 }} />

        {/* ── Tagline ────────────────────────────────────────────── */}
        <span
          style={{
            fontSize: 15,
            fontWeight: 400,
            color: FOREGROUND,
            fontFamily: "'Inter', sans-serif",
            letterSpacing: "0.1px",
          }}
        >
          Walk curious.
        </span>

        <div style={{ height: 32 }} />

        {/* ── Mode cards ─────────────────────────────────────────── */}
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

        {/* ── Search link ────────────────────────────────────────── */}
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
