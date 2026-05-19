import { Compass, Headphones, ChevronRight, MapPin, Search } from "lucide-react";

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

function MiniField({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        width: "100%",
        borderRadius: 14,
        border: `0.5px solid ${BORDER}`,
        backgroundColor: "rgba(16, 37, 55, 0.82)",
        padding: 14,
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <Search size={16} color={MUTED_FG} />
      <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
        <span
          style={{
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.7px",
            color: MUTED_FG,
            fontFamily: "'Inter', sans-serif",
            fontWeight: 600,
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontSize: 13,
            color: FOREGROUND,
            fontFamily: "'Inter', sans-serif",
            fontWeight: 500,
          }}
        >
          {value}
        </span>
      </div>
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
          paddingTop: 28,
          paddingBottom: 28,
          overflowY: "auto",
        }}
      >
        <div
          style={{
            width: "100%",
            paddingLeft: 24,
            paddingRight: 24,
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
              marginBottom: 2,
            }}
          >
            <MapPin size={36} color={PRIMARY} strokeWidth={1.75} />
          </div>

          <div
            style={{
              width: "100%",
              display: "flex",
              flexDirection: "column",
              gap: 10,
              marginTop: 4,
            }}
          >
            <div
              style={{
                padding: 14,
                borderRadius: 16,
                border: `0.5px solid ${BORDER}`,
                backgroundColor: CARD,
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span
                    style={{
                      fontSize: 11,
                      textTransform: "uppercase",
                      letterSpacing: "0.8px",
                      color: MUTED_FG,
                      fontWeight: 600,
                    }}
                  >
                    Location access
                  </span>
                  <span style={{ fontSize: 16, color: FOREGROUND, fontWeight: 600 }}>
                    Find nearby stories
                  </span>
                </div>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: ICON_BG,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <MapPin size={18} color={PRIMARY} strokeWidth={2} />
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <MiniField label="Search location" value="Try a neighborhood, address, or landmark" />
                <div
                  style={{
                    height: 44,
                    borderRadius: 12,
                    backgroundColor: PRIMARY,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                  }}
                >
                  <Compass size={18} color={BG} strokeWidth={2} />
                  <span style={{ color: BG, fontWeight: 700, fontSize: 14 }}>Explore this location</span>
                </div>
              </div>
            </div>

            <ModeCard
              icon={<Compass size={24} color={PRIMARY} strokeWidth={1.75} />}
              label="Explore"
              headline="Browse the hidden layers of a place."
              tagline="See what's around me."
            />
            <ModeCard
              icon={<Headphones size={24} color={PRIMARY} strokeWidth={1.75} />}
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
