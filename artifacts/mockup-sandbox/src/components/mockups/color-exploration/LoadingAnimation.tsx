import { useState, useEffect } from "react";

const colors = {
  background: "#F5F3F0",
  foreground: "#353230",
  mutedForeground: "#5C5752",
  primary: "#9C5A2E",
  muted: "#EDEBE8",
};

const MESSAGES = [
  "Digging through the archives...",
  "Checking old maps and records...",
  "Unearthing local secrets...",
  "What's hiding in plain sight here...",
  "Your personal time machine is warming up...",
  "Every spot has a story — finding yours now...",
];

function BuildingLine({
  delay,
  height,
  width,
}: {
  delay: number;
  height: number;
  width: number;
}) {
  return (
    <div
      style={{
        width,
        backgroundColor: colors.primary,
        borderRadius: "3px 3px 0 0",
        animation: `buildUp 2s ease-in-out ${delay}s infinite`,
        opacity: 0.6,
        alignSelf: "flex-end",
      }}
    >
      <style>{`
        @keyframes buildUp {
          0% { height: 0; opacity: 0.2; }
          30% { height: ${height}px; opacity: 0.7; }
          60% { height: ${height}px; opacity: 0.7; }
          80% { height: ${height * 0.3}px; opacity: 0.3; }
          100% { height: 0; opacity: 0.2; }
        }
      `}</style>
      <div style={{ height }} />
    </div>
  );
}

function SkylineLoader() {
  const buildings = [
    { delay: 0, height: 40, width: 14 },
    { delay: 0.15, height: 65, width: 18 },
    { delay: 0.3, height: 50, width: 12 },
    { delay: 0.45, height: 80, width: 16 },
    { delay: 0.6, height: 55, width: 14 },
    { delay: 0.75, height: 70, width: 20 },
    { delay: 0.9, height: 45, width: 12 },
    { delay: 1.05, height: 60, width: 16 },
    { delay: 1.2, height: 35, width: 14 },
  ];

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        gap: 4,
        height: 90,
        marginBottom: 8,
      }}
    >
      {buildings.map((b, i) => (
        <div
          key={i}
          style={{
            width: b.width,
            borderRadius: "3px 3px 0 0",
            alignSelf: "flex-end",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: "100%",
              backgroundColor: colors.primary,
              borderRadius: "3px 3px 0 0",
              animation: `buildUp${i} 2.4s ease-in-out ${b.delay}s infinite`,
            }}
          />
          <style>{`
            @keyframes buildUp${i} {
              0% { height: 0px; opacity: 0.15; }
              25% { height: ${b.height}px; opacity: 0.65; }
              55% { height: ${b.height}px; opacity: 0.65; }
              80% { height: ${b.height * 0.2}px; opacity: 0.2; }
              100% { height: 0px; opacity: 0.15; }
            }
          `}</style>
        </div>
      ))}
    </div>
  );
}

function PulseDots() {
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        justifyContent: "center",
        marginTop: 16,
      }}
    >
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: colors.primary,
            animation: `pulse 1.4s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
      <style>{`
        @keyframes pulse {
          0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
}

export function LoadingAnimation() {
  const [messageIndex, setMessageIndex] = useState(0);
  const [fade, setFade] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setMessageIndex((prev) => (prev + 1) % MESSAGES.length);
        setFade(true);
      }, 300);
    }, 3500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: colors.background,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Inter', sans-serif",
        padding: 24,
        gap: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 4,
        }}
      >
        <SkylineLoader />
        <div
          style={{
            width: 160,
            height: 2,
            backgroundColor: colors.primary + "30",
            borderRadius: 1,
          }}
        />
      </div>

      <div
        style={{
          textAlign: "center",
          minHeight: 48,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          marginTop: 8,
        }}
      >
        <p
          style={{
            fontSize: 15,
            color: colors.mutedForeground,
            margin: 0,
            transition: "opacity 0.3s ease",
            opacity: fade ? 1 : 0,
            lineHeight: 1.4,
          }}
        >
          {MESSAGES[messageIndex]}
        </p>
      </div>

      <PulseDots />
    </div>
  );
}
