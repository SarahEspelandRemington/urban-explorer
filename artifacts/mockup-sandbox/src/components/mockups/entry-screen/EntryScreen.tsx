import { Compass, Headphones, ChevronRight, MapPin } from "lucide-react";

const BG = "#081827";
const CARD = "#102537";
const FOREGROUND = "#FFF7E8";
const PRIMARY = "#F2A23A";
const MUTED_FG = "#B8AFC0";
const BORDER = "#294055";
const ICON_BG = "rgba(242, 162, 58, 0.094)";

function ModeCard({
  icon,
  label,
  headline,
  tagline,
}: {
  icon: React.ReactNode;
  label: string;
  headline: string;
  tagline: string;
}) {
  return (
    <div
      style={{
        width: "100%",
        borderRadius: 16,
        border: `0.5px solid ${BORDER}`,
        backgroundColor: CARD,
        paddingLeft: 18,
        paddingRight: 18,
        paddingTop: 18,
        paddingBottom: 18,
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        boxSizing: "border-box",
        cursor: "pointer",
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 24,
          backgroundColor: ICON_BG,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {icon}
      </div>

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: 3,
          minWidth: 0,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontFamily: "'Inter', sans-serif",
            fontWeight: 600,
            letterSpacing: "0.8px",
            textTransform: "uppercase",
            color: MUTED_FG,
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontSize: 16,
            fontFamily: "'Inter', sans-serif",
            fontWeight: 600,
            letterSpacing: "-0.3px",
            lineHeight: "22px",
            color: FOREGROUND,
          }}
        >
          {headline}
        </span>
        <span
          style={{
            fontSize: 13,
            fontFamily: "'Inter', sans-serif",
            fontWeight: 400,
            lineHeight: "18px",
            marginTop: 1,
            color: MUTED_FG,
          }}
        >
          {tagline}
        </span>
      </div>

      <ChevronRight size={18} color={MUTED_FG} strokeWidth={2} />
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
        alignItems: "stretch",
        overflow: "hidden",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          paddingTop: 40,
          paddingBottom: 40,
          overflowY: "auto",
        }}
      >
        <div
          style={{
            width: "100%",
            paddingLeft: 28,
            paddingRight: 28,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 14,
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 36,
              backgroundColor: ICON_BG,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 4,
            }}
          >
            <MapPin size={36} color={PRIMARY} strokeWidth={1.75} />
          </div>

          <div
            style={{
              width: "100%",
              display: "flex",
              flexDirection: "column",
              gap: 12,
              marginTop: 8,
            }}
          >
            <ModeCard
              icon={
                <Compass size={24} color={PRIMARY} strokeWidth={1.75} />
              }
              label="Explore"
              headline="Browse the hidden layers of a place."
              tagline="See what's around me."
            />
            <ModeCard
              icon={
                <Headphones size={24} color={PRIMARY} strokeWidth={1.75} />
              }
              label="Walk"
              headline="Put your phone away and wander."
              tagline="Go for a walk."
            />
          </div>
        </div>
      </div>
    </div>
  );
}
