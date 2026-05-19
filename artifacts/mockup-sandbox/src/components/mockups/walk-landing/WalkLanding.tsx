import {
  Headphones,
  Navigation,
  Map,
  ChevronLeft,
  ChevronRight,
  Lock,
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
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  headline: string;
  body: string;
  disabled?: boolean;
}) {
  return (
    <div
      style={{
        borderRadius: 16,
        border: `0.5px solid ${disabled ? BORDER + "80" : BORDER}`,
        backgroundColor: disabled ? `${CARD}99` : CARD,
        padding: "18px 18px",
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap: 16,
        opacity: disabled ? 0.6 : 1,
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
          gap: 3,
          minWidth: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.8px",
              textTransform: "uppercase",
              color: disabled ? MUTED_FG + "99" : MUTED_FG,
              fontFamily: "'Inter', sans-serif",
            }}
          >
            {label}
          </span>
          {disabled && (
            <div
              style={{
                borderRadius: 4,
                border: `0.5px solid ${BORDER}`,
                backgroundColor: MUTED,
                paddingLeft: 6,
                paddingRight: 6,
                paddingTop: 2,
                paddingBottom: 2,
                display: "flex",
                alignItems: "center",
                gap: 3,
              }}
            >
              <Lock size={9} color={MUTED_FG} strokeWidth={2} />
              <span style={{ fontSize: 9, color: MUTED_FG, fontWeight: 600, letterSpacing: "0.5px" }}>
                SOON
              </span>
            </div>
          )}
        </div>
        <span
          style={{
            fontSize: 16,
            fontWeight: 600,
            color: disabled ? FOREGROUND + "99" : FOREGROUND,
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
            marginTop: 2,
            fontFamily: "'Inter', sans-serif",
          }}
        >
          {body}
        </span>
      </div>

      {!disabled && <ChevronRight size={18} color={MUTED_FG} strokeWidth={2} />}
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
          padding: "20px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          overflowY: "auto",
        }}
      >
        <WalkCard
          icon={<Headphones size={26} color={PRIMARY} strokeWidth={1.75} />}
          label="Wander"
          headline="Put your phone away and wander."
          body="Stories narrate automatically as you move through the neighborhood. No route needed."
        />
        <WalkCard
          icon={<Navigation size={26} color={PRIMARY} strokeWidth={1.75} />}
          label="Plan a route"
          headline="Choose where you're going."
          body="Pick a start and end point, get a walking route, and discover what's along the way."
        />
        <WalkCard
          icon={<Map size={26} color={PRIMARY} strokeWidth={1.75} />}
          label="Guided walks"
          headline="Follow a curated experience."
          body="Thematic tours designed around specific eras, stories, or neighborhoods."
          disabled
        />

        {/* Note */}
        <div
          style={{
            marginTop: 8,
            borderRadius: 12,
            backgroundColor: MUTED,
            padding: "12px 14px",
          }}
        >
          <span
            style={{ fontSize: 12, color: MUTED_FG, lineHeight: "18px", display: "block" }}
          >
            Wander works best in areas with several stories nearby. You can always pause or switch to a planned route from within the walk.
          </span>
        </div>
      </div>
    </div>
  );
}
