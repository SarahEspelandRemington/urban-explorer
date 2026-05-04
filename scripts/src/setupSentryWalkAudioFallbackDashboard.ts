import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  SENTRY_HOST,
  type SentryDashboard,
  type SentryAlertRule,
  type AlertRuleSpec,
  requireEnv,
  sentryFetch,
  getProject,
  findExistingDashboard,
  findExistingAlertRule,
  deleteAlertRule,
  getDetectionType,
  upsertAlertRule,
} from "./lib/sentry.js";

const FALLBACK_METRIC_MRI = "c:custom/narration.audio_fallback@none";
const TOTAL_METRIC_MRI = "c:custom/narration.prefetch_event@none";
// Dedicated "narrations that actually started playback" counter. Used as
// the Panel 3 denominator so the rate isn't inflated by lifecycle events
// (DEDUPE / STOP_WALK_DISCARD) that ride on narration.prefetch_event.
// Emitted by trackNarrationPlayed in artifacts/urban-explorer/lib/sentryWalk.ts.
const PLAYED_METRIC_MRI = "c:custom/narration.played@none";
const FALLBACK_AGGREGATE_FOR_ALERT = `sum(${FALLBACK_METRIC_MRI})`;

// Reason tag values emitted by trackNarrationFallback. Kept here so the alert
// queries below stay in lock-step with lib/sentryWalk.ts.
const FETCH_REASONS = ["write_failure", "endpoint_error", "bad_response"];
const PLAYBACK_REASONS = [
  "playback_create",
  "playback_play",
  "playback_status_error",
  "playback_watchdog",
];

// Legacy single-rule name from before the fetch/playback split. The script
// detects but does not auto-delete it — see createAlertRules() for the warning.
// Opt-in env flag: when set to a truthy value, the script will DELETE the
// legacy rule after both per-side replacements are confirmed in place. Without
// the flag, behavior stays warn-only so the script has no destructive side
// effects without explicit consent.
const LEGACY_ALERT_NAME = "Walk Mode audio fallback rate";
const MIGRATE_LEGACY_FLAG = "MIGRATE_LEGACY_AUDIO_FALLBACK_ALERT";

function isMigrateLegacyEnabled(): boolean {
  const raw = process.env[MIGRATE_LEGACY_FLAG];
  if (raw == null) return false;
  const v = raw.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

const FETCH_ALERT_NAME = "Walk Mode audio fallback rate (fetch)";
const PLAYBACK_ALERT_NAME = "Walk Mode audio fallback rate (playback)";

// Detection mode for the per-side alert rules.
//
//   "dynamic" (default) — Sentry Anomaly Detection. The detector learns each
//                         metric's hourly/daily baseline (narration.audio_fallback
//                         filtered by reason group) and pages only when the count
//                         is genuinely anomalous against that baseline. This
//                         implicitly normalizes against narration volume: a quiet
//                         hour with a 100% failure rate is anomalous and pages;
//                         a busy hour with the usual fallback noise stays silent.
//                         As close as Sentry currently gets to firing on a
//                         fallback / narration.played ratio without supporting
//                         cross-metric equation alerts on custom metrics.
//
//   "static"            — Legacy absolute-count thresholds (fetch >=15/8, playback
//                         >=10/5). Use this escape hatch only if the org's Sentry
//                         plan does not support anomaly detection (it requires
//                         Business plan or above) or if you need to bridge a gap
//                         while dynamic alerts gather their ~7-day baseline.
//
// Set via the AUDIO_FALLBACK_ALERT_DETECTION_TYPE env var; defaults to "dynamic".
const DETECTION_TYPE_ENV = "AUDIO_FALLBACK_ALERT_DETECTION_TYPE";

async function createDashboard(
  token: string,
  org: string,
  projectId: string,
): Promise<SentryDashboard> {
  const title = "Walk Mode Audio Fallback";
  const existing = await findExistingDashboard(token, org, title);
  if (existing) {
    console.log(`Dashboard "${title}" already exists (id=${existing.id}), reusing.`);
    return existing;
  }

  const body = {
    title,
    widgets: [
      {
        title: "Audio fallback events by reason",
        displayType: "area",
        interval: "5m",
        widgetType: "custom-metrics",
        layout: { x: 0, y: 0, w: 2, h: 2, minH: 2 },
        queries: [
          {
            name: "",
            fields: [`sum(${FALLBACK_METRIC_MRI})`],
            aggregates: [`sum(${FALLBACK_METRIC_MRI})`],
            columns: ["reason"],
            conditions: "",
            orderby: "",
          },
        ],
      },
      {
        title: "Total narration volume",
        displayType: "line",
        interval: "5m",
        widgetType: "custom-metrics",
        layout: { x: 2, y: 0, w: 2, h: 2, minH: 2 },
        queries: [
          {
            name: "",
            fields: [`sum(${TOTAL_METRIC_MRI})`],
            aggregates: [`sum(${TOTAL_METRIC_MRI})`],
            columns: [],
            conditions: "",
            orderby: "",
          },
        ],
      },
      {
        title: "Audio fallback rate %",
        displayType: "line",
        interval: "5m",
        widgetType: "custom-metrics",
        layout: { x: 0, y: 2, w: 4, h: 2, minH: 2 },
        queries: [
          {
            name: "A",
            fields: [`sum(${FALLBACK_METRIC_MRI})`],
            aggregates: [`sum(${FALLBACK_METRIC_MRI})`],
            columns: [],
            conditions: "",
            orderby: "",
          },
          {
            // Denominator: narrations that actually started playback. We
            // intentionally do NOT use narration.prefetch_event here — that
            // counter also includes lifecycle events (DEDUPE,
            // STOP_WALK_DISCARD) that over-count true narrations and make
            // the rate look better than reality. narration.played is
            // emitted once per queued item that successfully began playing
            // (audio play() returned without throwing, or speech.speak /
            // window.speechSynthesis.speak was invoked).
            name: "B",
            fields: [`sum(${PLAYED_METRIC_MRI})`],
            aggregates: [`sum(${PLAYED_METRIC_MRI})`],
            columns: [],
            conditions: "",
            orderby: "",
          },
          {
            name: "Fallback rate %",
            fields: ["equation|100 * a / b"],
            aggregates: ["equation|100 * a / b"],
            columns: [],
            conditions: "",
            orderby: "",
          },
        ],
      },
    ],
    projects: [Number(projectId)],
  };

  const created = await sentryFetch<SentryDashboard>(
    token,
    `/organizations/${encodeURIComponent(org)}/dashboards/`,
    { method: "POST", body: JSON.stringify(body) },
  );
  console.log(`Created dashboard "${title}" (id=${created.id}).`);
  return created;
}

function buildFetchSpec(): AlertRuleSpec {
  return {
    name: FETCH_ALERT_NAME,
    aggregate: FALLBACK_AGGREGATE_FOR_ALERT,
    query: `reason:[${FETCH_REASONS.join(",")}]`,
    // Above-threshold direction. We page when fallback counts climb.
    thresholdType: 0,
    // 1h window: long enough to smooth out a single bad minute, short enough
    // to react before a regression eats the whole shift. Matches the static
    // baseline thresholds were originally calibrated against.
    timeWindow: 60,
    // Dynamic sensitivity 'medium' — endpoint_error / bad_response can
    // legitimately surge during third-party (OpenAI) blips that resolve on
    // their own; we want to catch sustained regressions, not paper over
    // every transient blip.
    dynamicSensitivity: "medium",
    staticCritical: 15,
    staticWarning: 8,
    staticResolve: 5,
    rationale:
      "Fetch-side reasons (write_failure | endpoint_error | bad_response). " +
      "Dynamic sensitivity 'medium' — endpoint_error / bad_response can " +
      "legitimately surge during third-party (OpenAI) blips that resolve on " +
      "their own; we want to catch sustained regressions, not paper over " +
      "every transient blip. Static fallback thresholds are carried over " +
      "from the original combined rule and remain placeholders until real " +
      "hourly walk volume confirms.",
  };
}

function buildPlaybackSpec(): AlertRuleSpec {
  return {
    name: PLAYBACK_ALERT_NAME,
    aggregate: FALLBACK_AGGREGATE_FOR_ALERT,
    query: `reason:[${PLAYBACK_REASONS.join(",")}]`,
    thresholdType: 0,
    timeWindow: 60,
    // Dynamic sensitivity 'high' — a sustained playback failure rate almost
    // always indicates an expo-audio / OS audio-stack regression worth
    // catching as early as possible (and there's no upstream observability —
    // OpenAI/server logs — to back-stop a missed page).
    dynamicSensitivity: "high",
    staticCritical: 10,
    staticWarning: 5,
    staticResolve: 3,
    rationale:
      "Playback-side reasons (playback_create | playback_play | " +
      "playback_status_error | playback_watchdog). Dynamic sensitivity " +
      "'high' — a sustained playback failure rate almost always indicates " +
      "an expo-audio or OS audio-stack regression worth catching early, " +
      "and unlike fetch-side issues there is no upstream observability " +
      "(OpenAI/server logs) to back-stop a missed page. Static fallback " +
      "thresholds are placeholders until real volume is observed.",
  };
}

async function maybeDeleteLegacyRule(
  token: string,
  org: string,
  legacy: SentryAlertRule | null,
): Promise<void> {
  if (!legacy) return;
  if (!isMigrateLegacyEnabled()) {
    console.warn(
      `\nLegacy combined alert rule "${LEGACY_ALERT_NAME}" still exists (id=${legacy.id}).\n` +
        `It is now superseded by the per-side fetch/playback rules above. Either:\n` +
        `  - Disable or delete it manually in the Sentry UI:\n` +
        `      ${SENTRY_HOST}/organizations/${org}/alerts/rules/details/${legacy.id}/\n` +
        `  - Or re-run this script with ${MIGRATE_LEGACY_FLAG}=1 to delete it automatically\n` +
        `    (safe now that both per-side replacements are confirmed in place).\n`,
    );
    return;
  }
  // Re-fetch by name so we never delete based on a stale reference (e.g.
  // the operator already deleted it manually between the up-front detection
  // and now), and so a no-op run with the flag set is safe.
  const stillThere = await findExistingAlertRule(token, org, LEGACY_ALERT_NAME);
  if (stillThere) {
    await deleteAlertRule(token, org, stillThere.id);
    console.log(
      `Deleted legacy combined alert rule "${LEGACY_ALERT_NAME}" (id=${stillThere.id}) ` +
        `because ${MIGRATE_LEGACY_FLAG} is set and both per-side replacements are in place.`,
    );
  } else {
    console.log(
      `Legacy combined alert rule "${LEGACY_ALERT_NAME}" was already gone by the time ` +
        `we tried to delete it (${MIGRATE_LEGACY_FLAG} set). Nothing to do.`,
    );
  }
}

async function createAlertRules(
  token: string,
  org: string,
  projectSlug: string,
): Promise<{ fetch: SentryAlertRule; playback: SentryAlertRule }> {
  // Detect the pre-split combined rule up front. We only act on it AFTER both
  // per-side replacements are confirmed in place below — that way an
  // intermediate failure can never leave the project with neither the legacy
  // rule nor a working replacement.
  const legacy = await findExistingAlertRule(token, org, LEGACY_ALERT_NAME);
  const detectionType = getDetectionType(DETECTION_TYPE_ENV);

  console.log(
    `Audio-fallback alert detection mode: ${detectionType}` +
      (detectionType === "dynamic"
        ? " (Sentry Anomaly Detection — sensitivity-based, learns hourly/daily " +
          "baseline; ~7 days of data needed before it pages reliably)"
        : ` (legacy absolute-count thresholds; set ${DETECTION_TYPE_ENV}=dynamic to switch back)`),
  );

  const fetchRule = await upsertAlertRule(
    token,
    org,
    projectSlug,
    buildFetchSpec(),
    detectionType,
  );
  const playbackRule = await upsertAlertRule(
    token,
    org,
    projectSlug,
    buildPlaybackSpec(),
    detectionType,
  );

  // Now that both replacements are confirmed in place, optionally clean up
  // the legacy combined rule.
  await maybeDeleteLegacyRule(token, org, legacy);

  return { fetch: fetchRule, playback: playbackRule };
}

async function patchReplitMd(
  org: string,
  dashboardId: string,
  fetchAlertRuleId: string,
  playbackAlertRuleId: string,
): Promise<void> {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const replitMdPath = resolve(repoRoot, "replit.md");
  const before = await readFile(replitMdPath, "utf8");

  const dashboardUrl = `${SENTRY_HOST}/organizations/${org}/dashboard/${dashboardId}/`;
  const fetchAlertUrl = `${SENTRY_HOST}/organizations/${org}/alerts/rules/details/${fetchAlertRuleId}/`;
  const playbackAlertUrl = `${SENTRY_HOST}/organizations/${org}/alerts/rules/details/${playbackAlertRuleId}/`;

  const dashboardLine = `    - **Audio Fallback Dashboard URL**: ${dashboardUrl}`;
  const fetchAlertLine = `      - **Fetch-side Alert URL**: ${fetchAlertUrl}`;
  const playbackAlertLine = `      - **Playback-side Alert URL**: ${playbackAlertUrl}`;

  const after = before
    .replace(
      /^ {4}- \*\*Audio Fallback Dashboard URL\*\*:.*$/m,
      dashboardLine,
    )
    .replace(
      /^ {6}- \*\*Fetch-side Alert URL\*\*:.*$/m,
      fetchAlertLine,
    )
    .replace(
      /^ {6}- \*\*Playback-side Alert URL\*\*:.*$/m,
      playbackAlertLine,
    );

  if (after === before) {
    console.warn(
      "replit.md was not modified — could not find the Audio Fallback Dashboard URL / Fetch-side Alert URL / Playback-side Alert URL placeholder lines. " +
        "Paste these manually:\n" +
        `  ${dashboardUrl}\n  ${fetchAlertUrl}\n  ${playbackAlertUrl}`,
    );
    return;
  }

  await writeFile(replitMdPath, after, "utf8");
  console.log(`Updated replit.md with audio-fallback dashboard + per-side alert URLs.`);
}

async function main(): Promise<void> {
  const { token, org, project: projectSlug } = requireEnv();

  console.log(`Using Sentry org=${org} project=${projectSlug}`);
  const project = await getProject(token, org, projectSlug);

  const dashboard = await createDashboard(token, org, project.id);
  const { fetch: fetchRule, playback: playbackRule } = await createAlertRules(
    token,
    org,
    projectSlug,
  );

  await patchReplitMd(org, dashboard.id, fetchRule.id, playbackRule.id);

  console.log("\nDone. Verify in Sentry:");
  console.log(`  Dashboard:      ${SENTRY_HOST}/organizations/${org}/dashboard/${dashboard.id}/`);
  console.log(`  Fetch alert:    ${SENTRY_HOST}/organizations/${org}/alerts/rules/details/${fetchRule.id}/`);
  console.log(`  Playback alert: ${SENTRY_HOST}/organizations/${org}/alerts/rules/details/${playbackRule.id}/`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
