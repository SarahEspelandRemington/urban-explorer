import {
  Headphones,
  Navigation,
  Map,
  ChevronLeft,
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

function WalkCard({
  icon,
  label,
  headline,
  body,
}: {
  icon: React.ReactNode;
  label: string;
  headline: string;
  body: string;
}) {
  return (
    <div
      style={{
        borderRadius: 16,
        border: `0.5px solid ${BORDER}`,
        backgroundColor: CARD,
        padding: "18px 18px",
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap: 16,
      }}
    >
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: 26,
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
          gap: 4,
          minWidth: 0,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.8px",
            textTransform: "uppercase",
            color: MUTED_FG,
            opacity: 0.75,
            fontFamily: "'Inter', sans-serif",
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontSize: 16,
            fontWeight: 600,
            color: FOREGROUND,
            letterSpacing: "-0.3px",
            lineHeight: "22px",
            fontFamily: "'Inter', sans-serif",
          }}
        >
          {headline}
        </span>
        <span
          style={{
            fontSize: 13,
            color: MUTED_FG,
            lineHeight: "18px",
            marginTop: 1,
            opacity: 0.85,
            fontFamily: "'Inter', sans-serif",
          }}
        >
          {body}
        </span>
      </div>

      <ChevronRight size={18} color={MUTED_FG} strokeWidth={2} />
    </div>
  );
}

function GuidedCard() {
  const themes = ["Hidden Infrastructure", "Jazz Age Midtown", "Waterfront Industry"];
  return (
    <div
      style={{
        borderRadius: 16,
        border: `0.5px solid ${BORDER}`,
        backgroundColor: CARD,
        padding: "18px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        opacity: 0.72,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 26,
            backgroundColor: ICON_BG,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Map size={26} color={PRIMARY} strokeWidth={1.75} />
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.8px",
                textTransform: "uppercase",
                color: MUTED_FG,
                opacity: 0.75,
                fontFamily: "'Inter', sans-serif",
              }}
            >
              Guided walks
            </span>
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.6px",
                textTransform: "uppercase",
                color: PRIMARY,
                opacity: 0.7,
                fontFamily: "'Inter', sans-serif",
                borderRadius: 4,
                border: `0.5px solid ${PRIMARY}40`,
                paddingLeft: 5,
                paddingRight: 5,
                paddingTop: 2,
                paddingBottom: 2,
              }}
            >
              Coming soon
            </span>
          </div>
          <span
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: FOREGROUND,
              letterSpacing: "-0.3px",
              lineHeight: "22px",
              fontFamily: "'Inter', sans-serif",
            }}
          >
            Follow a curated experience.
          </span>
          <span
            style={{
              fontSize: 13,
              color: MUTED_FG,
              lineHeight: "18px",
              marginTop: 1,
              opacity: 0.85,
              fontFamily: "'Inter', sans-serif",
            }}
          >
            Thematic tours built around specific eras, stories, and neighborhoods.
          </span>
        </div>
      </div>

      {/* Example themes */}
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", paddingLeft: 68 }}>
        {themes.map((theme) => (
          <div
            key={theme}
            style={{
              borderRadius: 6,
              border: `0.5px solid ${BORDER}`,
              backgroundColor: MUTED,
              paddingLeft: 9,
              paddingRight: 9,
              paddingTop: 4,
              paddingBottom: 4,
            }}
          >
            <span
              style={{
                fontSize: 11,
                color: MUTED_FG,
                fontFamily: "'Inter', sans-serif",
                fontWeight: 500,
                opacity: 0.8,
              }}
            >
              {theme}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function WalkLanding() {
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
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "0 20px 14px",
          borderBottom: `0.5px solid ${BORDER}`,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            backgroundColor: MUTED,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <ChevronLeft size={18} color={FOREGROUND} strokeWidth={2} />
        </div>
        <div>
          <span
            style={{
              fontSize: 26,
              fontWeight: 700,
              color: FOREGROUND,
              letterSpacing: "-0.5px",
              display: "block",
            }}
          >
            Walk
          </span>
          <span
            style={{
              fontSize: 13,
              color: MUTED_FG,
              fontStyle: "italic",
              display: "block",
              marginTop: 1,
              opacity: 0.8,
            }}
          >
            Choose how you want to move.
          </span>
        </div>
      </div>

      {/* Mode cards */}
      <div
        style={{
          flex: 1,
          padding: "18px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          overflowY: "auto",
        }}
      >
        <WalkCard
          icon={<Headphones size={26} color={PRIMARY} strokeWidth={1.75} />}
          label="Wander"
          headline="Listen as you wander."
          body="Stories narrate automatically as you move through the neighborhood. No route needed."
        />
        <WalkCard
          icon={<Navigation size={26} color={PRIMARY} strokeWidth={1.75} />}
          label="Plan a route"
          headline="Choose where you're going."
          body="Pick a start and end point, get a walking route, and discover what's along the way."
        />
        <GuidedCard />

        {/* Grounding note */}
        <div
          style={{
            borderRadius: 11,
            backgroundColor: MUTED,
            padding: "11px 14px",
          }}
        >
          <span
            style={{
              fontSize: 12,
              color: MUTED_FG,
              lineHeight: "18px",
              display: "block",
              opacity: 0.8,
            }}
          >
            Wander works best when several stories are nearby. You can pause or switch to a planned route any time.
          </span>
        </div>
      </div>
    </div>
  );
}
