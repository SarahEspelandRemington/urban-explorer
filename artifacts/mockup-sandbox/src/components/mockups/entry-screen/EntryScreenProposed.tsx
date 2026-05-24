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
  label,
  headline,
  subcopy,
  buttonLabel,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  headline: string;
  subcopy: string;
  buttonLabel: string;
  accent?: boolean;
}) {
  return (
    <div
      style={{
        backgroundColor: CARD,
        borderRadius: 18,
        border: `1px solid ${accent ? PRIMARY + "55" : BORDER}`,
        padding: "20px 20px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        boxShadow: accent
          ? `0 0 0 1px ${PRIMARY}18, 0 4px 20px rgba(0,0,0,0.28)`
          : "0 2px 12px rgba(0,0,0,0.22)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: 11,
            backgroundColor: ICON_BG,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "1.1px",
            textTransform: "uppercase",
            color: PRIMARY,
            opacity: 0.85,
            fontFamily: "'Inter', sans-serif",
          }}
        >
          {label}
        </span>
      </div>
      <span
        style={{
          fontSize: 17,
          fontWeight: 700,
          color: FOREGROUND,
          fontFamily: "'Inter', sans-serif",
          letterSpacing: "-0.3px",
          lineHeight: "23px",
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
        }}
      >
        {subcopy}
      </span>
      <div
        style={{
          marginTop: 4,
          borderRadius: 10,
          backgroundColor: accent ? PRIMARY : PRIMARY + "18",
          padding: "11px 0",
          textAlign: "center",
        }}
      >
        <span
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: accent ? BG : PRIMARY,
            fontFamily: "'Inter', sans-serif",
            letterSpacing: "0.1px",
          }}
        >
          {buttonLabel}
        </span>
      </div>
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
        <div style={{ height: 20 }} />

        {/* ── Brand mark ─────────────────────────────────────────── */}
        <img
          src="/streetlit-icon.png"
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
            fontSize: 16,
            fontWeight: 400,
            color: FOREGROUND,
            fontFamily: "'Inter', sans-serif",
            letterSpacing: "0.1px",
          }}
        >
          Walk curious.
        </span>

        <div style={{ height: 6 }} />

        {/* ── Supporting line ────────────────────────────────────── */}
        <span
          style={{
            fontSize: 13,
            color: MUTED_FG,
            fontFamily: "'Inter', sans-serif",
            textAlign: "center",
            lineHeight: "18px",
            fontStyle: "italic",
          }}
        >
          Small stories hidden in ordinary places.
        </span>

        <div style={{ height: 28 }} />

        {/* ── Mode cards ─────────────────────────────────────────── */}
        <ModeCard
          icon={<Compass size={18} color={PRIMARY} strokeWidth={1.9} />}
          label="Explore"
          headline="Browse the hidden layers of a place"
          subcopy="See what's around me."
          buttonLabel="See what's around me."
        />

        <div style={{ height: 12 }} />

        <ModeCard
          icon={<Headphones size={18} color={PRIMARY} strokeWidth={1.9} />}
          label="Walk"
          headline="Listen to the city unfold around you"
          subcopy="Go for a walk."
          buttonLabel="Go for a walk."
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
            textDecorationColor: MUTED_FG + "66",
            opacity: 0.8,
          }}
        >
          Search for a location
        </span>
      </div>
    </div>
  );
}
