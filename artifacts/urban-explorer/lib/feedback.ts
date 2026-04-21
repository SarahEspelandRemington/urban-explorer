import AsyncStorage from "@react-native-async-storage/async-storage";

export const FEEDBACK_CAPTURE_ENABLED = true;

export type Severity = "bug" | "confused" | "idea" | "worked";

export const SEVERITY_META: Record<Severity, { label: string; emoji: string; color: string }> = {
  bug: { label: "Bug", emoji: "🐛", color: "#dc2626" },
  confused: { label: "Confused", emoji: "😕", color: "#d97706" },
  idea: { label: "Idea", emoji: "💡", color: "#2563eb" },
  worked: { label: "Worked", emoji: "👍", color: "#16a34a" },
};

export interface FeedbackEvent {
  ts: number;
  type: string;
  data: Record<string, unknown>;
}

export interface FeedbackContextSnapshot {
  route?: string;
  walkActive?: boolean;
  currentPlace?: string | null;
  location?: { lat: number; lng: number; accuracy?: number | null } | null;
  walkStats?: { placesNarrated: number; distanceWalked: number } | null;
  appVersion?: string;
}

export interface FeedbackReport {
  id: string;
  ts: number;
  severity: Severity;
  note: string;
  audioUri?: string | null;
  audioDurationMs?: number | null;
  context: FeedbackContextSnapshot;
  recentEvents: FeedbackEvent[];
}

const EVENT_BUFFER_SIZE = 60;
const STORAGE_KEY = "feedback.reports.v1";

let eventBuffer: FeedbackEvent[] = [];

export function logEvent(type: string, data: Record<string, unknown> = {}): void {
  if (!FEEDBACK_CAPTURE_ENABLED) return;
  eventBuffer.push({ ts: Date.now(), type, data });
  if (eventBuffer.length > EVENT_BUFFER_SIZE) {
    eventBuffer = eventBuffer.slice(eventBuffer.length - EVENT_BUFFER_SIZE);
  }
}

export function getRecentEvents(): FeedbackEvent[] {
  return [...eventBuffer];
}

export function clearEventBuffer(): void {
  eventBuffer = [];
}

export async function getReports(): Promise<FeedbackReport[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as FeedbackReport[];
  } catch {
    return [];
  }
}

export async function saveReport(input: {
  severity: Severity;
  note: string;
  audioUri?: string | null;
  audioDurationMs?: number | null;
  context: FeedbackContextSnapshot;
}): Promise<FeedbackReport> {
  const report: FeedbackReport = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    ts: Date.now(),
    severity: input.severity,
    note: input.note,
    audioUri: input.audioUri ?? null,
    audioDurationMs: input.audioDurationMs ?? null,
    context: input.context,
    recentEvents: getRecentEvents(),
  };
  const existing = await getReports();
  const next = [report, ...existing];
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return report;
}

export async function deleteReport(id: string): Promise<void> {
  const existing = await getReports();
  const next = existing.filter((r) => r.id !== id);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export async function clearAllReports(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}

export function exportReportsAsText(reports: FeedbackReport[]): string {
  if (reports.length === 0) return "(no reports)";
  const lines: string[] = [];
  lines.push(`Urban Explorer field-test reports (${reports.length})`);
  lines.push(`Exported: ${new Date().toISOString()}`);
  lines.push("");
  for (const r of reports) {
    const meta = SEVERITY_META[r.severity];
    lines.push("─".repeat(60));
    lines.push(`${meta.emoji} ${meta.label} · ${new Date(r.ts).toLocaleString()}`);
    lines.push(`Note: ${r.note || "(none)"}`);
    if (r.audioUri) {
      const dur = r.audioDurationMs ? ` (${Math.round(r.audioDurationMs / 1000)}s)` : "";
      lines.push(`Voice memo: ${r.audioUri}${dur}`);
    }
    lines.push("Context:");
    if (r.context.route) lines.push(`  route: ${r.context.route}`);
    if (r.context.walkActive !== undefined) lines.push(`  walkActive: ${r.context.walkActive}`);
    if (r.context.currentPlace) lines.push(`  currentPlace: ${r.context.currentPlace}`);
    if (r.context.location) {
      const acc = r.context.location.accuracy != null ? `±${Math.round(r.context.location.accuracy)}m` : "";
      lines.push(`  location: ${r.context.location.lat.toFixed(6)}, ${r.context.location.lng.toFixed(6)} ${acc}`);
    }
    if (r.context.walkStats) {
      lines.push(
        `  walkStats: ${r.context.walkStats.placesNarrated} narrated, ${Math.round(r.context.walkStats.distanceWalked)}m walked`,
      );
    }
    if (r.context.appVersion) lines.push(`  appVersion: ${r.context.appVersion}`);
    if (r.recentEvents.length > 0) {
      lines.push(`Recent events (${r.recentEvents.length}):`);
      for (const e of r.recentEvents) {
        const dt = new Date(e.ts).toISOString().slice(11, 19);
        const dataStr = Object.keys(e.data).length
          ? " " + JSON.stringify(e.data)
          : "";
        lines.push(`  [${dt}] ${e.type}${dataStr}`);
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function exportReportsAsJson(reports: FeedbackReport[]): string {
  return JSON.stringify(reports, null, 2);
}
