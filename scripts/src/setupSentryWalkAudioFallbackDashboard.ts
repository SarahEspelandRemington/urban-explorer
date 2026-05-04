import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SENTRY_HOST = process.env.SENTRY_HOST ?? "https://sentry.io";
const SENTRY_AUTH_TOKEN = process.env.SENTRY_AUTH_TOKEN;
const SENTRY_ORG = process.env.SENTRY_ORG;
const SENTRY_PROJECT = process.env.SENTRY_PROJECT;

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
type DetectionType = "dynamic" | "static";
function getDetectionType(): DetectionType {
  const raw = (process.env[DETECTION_TYPE_ENV] ?? "").trim().toLowerCase();
  if (raw === "static") return "static";
  if (raw === "" || raw === "dynamic") return "dynamic";
  console.warn(
    `Unknown ${DETECTION_TYPE_ENV}=${raw} — defaulting to "dynamic". Supported values: "dynamic" | "static".`,
  );
  return "dynamic";
}

interface SentryProject {
  id: string;
  slug: string;
}

interface SentryDashboard {
  id: string;
  title: string;
}

interface SentryAlertRule {
  id: string;
  name: string;
}

function requireEnv(): {
  token: string;
  org: string;
  project: string;
} {
  const missing: string[] = [];
  if (!SENTRY_AUTH_TOKEN) missing.push("SENTRY_AUTH_TOKEN");
  if (!SENTRY_ORG) missing.push("SENTRY_ORG");
  if (!SENTRY_PROJECT) missing.push("SENTRY_PROJECT");
  if (missing.length > 0) {
    console.error(
      `Missing required env vars: ${missing.join(", ")}\n\n` +
        `Set them and re-run. Required scopes on SENTRY_AUTH_TOKEN:\n` +
        `  - org:read\n` +
        `  - project:read\n` +
        `  - project:write\n` +
        `  - alerts:write\n\n` +
        `Create an internal integration token at:\n` +
        `  ${SENTRY_HOST}/settings/<org>/developer-settings/\n`,
    );
    process.exit(1);
  }
  return {
    token: SENTRY_AUTH_TOKEN!,
    org: SENTRY_ORG!,
    project: SENTRY_PROJECT!,
  };
}

async function sentryFetch<T>(
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const url = `${SENTRY_HOST}/api/0${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Sentry API ${init.method ?? "GET"} ${path} failed: ${res.status} ${res.statusText}\n${body}`,
    );
  }
  return (await res.json()) as T;
}

async function getProject(
  token: string,
  org: string,
  projectSlug: string,
): Promise<SentryProject> {
  return sentryFetch<SentryProject>(
    token,
    `/projects/${encodeURIComponent(org)}/${encodeURIComponent(projectSlug)}/`,
  );
}

async function findExistingDashboard(
  token: string,
  org: string,
  title: string,
): Promise<SentryDashboard | null> {
  const list = await sentryFetch<SentryDashboard[]>(
    token,
    `/organizations/${encodeURIComponent(org)}/dashboards/?query=${encodeURIComponent(title)}`,
  );
  return list.find((d) => d.title === title) ?? null;
}

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

async function findExistingAlertRule(
  token: string,
  org: string,
  name: string,
): Promise<SentryAlertRule | null> {
  const list = await sentryFetch<SentryAlertRule[]>(
    token,
    `/organizations/${encodeURIComponent(org)}/alert-rules/`,
  );
  return list.find((r) => r.name === name) ?? null;
}

async function deleteAlertRule(
  token: string,
  org: string,
  ruleId: string,
): Promise<void> {
  // DELETE /alert-rules/<id>/ returns 204 No Content on success, which is not
  // valid JSON — bypass sentryFetch's JSON parser here.
  const url = `${SENTRY_HOST}/api/0/organizations/${encodeURIComponent(org)}/alert-rules/${encodeURIComponent(ruleId)}/`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Sentry API DELETE /alert-rules/${ruleId}/ failed: ${res.status} ${res.statusText}\n${body}`,
    );
  }
}

interface AlertRuleSpec {
  name: string;
  reasons: string[];
  // Dynamic-mode sensitivity. Sentry maps this onto an internal anomaly score
  // threshold; "high" pages on smaller deviations, "low" only on large ones.
  // Playback-side runs at "high" because a sustained playback failure rate
  // almost always indicates an expo-audio / OS audio-stack regression worth
  // catching as early as possible (and there's no upstream observability —
  // OpenAI/server logs — to back-stop a missed page).
  // Fetch-side runs at "medium" because endpoint_error / bad_response can
  // legitimately surge during third-party (OpenAI) blips that resolve on
  // their own; we want to catch sustained regressions, not paper over every
  // transient blip.
  dynamicSensitivity: "low" | "medium" | "high";
  // Static-mode legacy thresholds. Only used when AUDIO_FALLBACK_ALERT_DETECTION_TYPE=static.
  staticCritical: number;
  staticWarning: number;
  staticResolve: number;
  rationale: string;
}

interface AlertRuleBodyBase {
  name: string;
  aggregate: string;
  dataset: string;
  query: string;
  timeWindow: number;
  thresholdType: number;
  projects: string[];
  environment: null;
  comparisonDelta: null;
}

function buildAlertRuleBody(
  spec: AlertRuleSpec,
  detectionType: DetectionType,
  projectSlug: string,
): Record<string, unknown> {
  const base: AlertRuleBodyBase = {
    name: spec.name,
    aggregate: FALLBACK_AGGREGATE_FOR_ALERT,
    dataset: "metrics",
    query: `reason:[${spec.reasons.join(",")}]`,
    // 1h window: long enough to smooth out a single bad minute, short enough
    // to react before a regression eats the whole shift. Matches the static
    // baseline thresholds were originally calibrated against.
    timeWindow: 60,
    thresholdType: 0,
    projects: [projectSlug],
    environment: null,
    comparisonDelta: null,
  };

  if (detectionType === "dynamic") {
    // Sentry Anomaly Detection. The detector learns each metric's
    // hourly/daily baseline and pages when the count deviates significantly.
    // Triggers in dynamic mode use alertThreshold=0 — Sentry ignores the
    // numeric threshold and uses the trained anomaly score instead.
    // Sensitivity (low/medium/high) is what actually controls how easily the
    // alert fires. seasonality "auto" lets Sentry pick hourly vs daily vs
    // weekly periodicity from the data.
    return {
      ...base,
      detectionType: "dynamic",
      sensitivity: spec.dynamicSensitivity,
      seasonality: "auto",
      resolveThreshold: null,
      triggers: [
        {
          label: "critical",
          alertThreshold: 0,
          actions: [],
        },
      ],
    };
  }

  // Static (legacy) escape hatch. Absolute per-side fallback count thresholds.
  return {
    ...base,
    detectionType: "static",
    resolveThreshold: spec.staticResolve,
    triggers: [
      {
        label: "critical",
        alertThreshold: spec.staticCritical,
        actions: [],
      },
      {
        label: "warning",
        alertThreshold: spec.staticWarning,
        actions: [],
      },
    ],
  };
}

async function upsertOneAlertRule(
  token: string,
  org: string,
  projectSlug: string,
  spec: AlertRuleSpec,
  detectionType: DetectionType,
): Promise<SentryAlertRule> {
  const body = buildAlertRuleBody(spec, detectionType, projectSlug);
  const existing = await findExistingAlertRule(token, org, spec.name);

  if (existing) {
    // PUT to update so re-running the script migrates legacy static rules
    // (and any drift in thresholds / reason filter) onto the current spec
    // without manual intervention.
    const updated = await sentryFetch<SentryAlertRule>(
      token,
      `/organizations/${encodeURIComponent(org)}/alert-rules/${encodeURIComponent(existing.id)}/`,
      { method: "PUT", body: JSON.stringify(body) },
    );
    console.log(
      `Updated alert rule "${spec.name}" (id=${updated.id}) → detectionType=${detectionType}` +
        (detectionType === "dynamic"
          ? `, sensitivity=${spec.dynamicSensitivity}`
          : `, critical=${spec.staticCritical}/warning=${spec.staticWarning}`) +
        `. Rationale: ${spec.rationale}`,
    );
    return updated;
  }

  const created = await sentryFetch<SentryAlertRule>(
    token,
    `/organizations/${encodeURIComponent(org)}/alert-rules/`,
    { method: "POST", body: JSON.stringify(body) },
  );
  console.log(
    `Created alert rule "${spec.name}" (id=${created.id}) → detectionType=${detectionType}` +
      (detectionType === "dynamic"
        ? `, sensitivity=${spec.dynamicSensitivity}`
        : `, critical=${spec.staticCritical}/warning=${spec.staticWarning}`) +
      `. Rationale: ${spec.rationale}`,
  );
  console.warn(
    `NOTE: Alert was created with no notification actions. Add a Slack/Email\n` +
      `target in the Sentry UI so the on-call channel actually gets paged:\n` +
      `  ${SENTRY_HOST}/organizations/${org}/alerts/rules/details/${created.id}/`,
  );
  return created;
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
  const migrateLegacy = isMigrateLegacyEnabled();
  const detectionType = getDetectionType();

  console.log(
    `Audio-fallback alert detection mode: ${detectionType}` +
      (detectionType === "dynamic"
        ? " (Sentry Anomaly Detection — sensitivity-based, learns hourly/daily " +
          "baseline; ~7 days of data needed before it pages reliably)"
        : ` (legacy absolute-count thresholds; set ${DETECTION_TYPE_ENV}=dynamic to switch back)`),
  );

  const fetchSpec: AlertRuleSpec = {
    name: FETCH_ALERT_NAME,
    reasons: FETCH_REASONS,
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

  const playbackSpec: AlertRuleSpec = {
    name: PLAYBACK_ALERT_NAME,
    reasons: PLAYBACK_REASONS,
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

  const fetchRule = await upsertOneAlertRule(
    token,
    org,
    projectSlug,
    fetchSpec,
    detectionType,
  );
  const playbackRule = await upsertOneAlertRule(
    token,
    org,
    projectSlug,
    playbackSpec,
    detectionType,
  );

  // Now that both replacements are confirmed in place, optionally clean up
  // the legacy combined rule. Re-fetch by name so we never delete based on a
  // stale reference (e.g. the operator already deleted it manually between
  // the up-front detection and now), and so a no-op run with the flag set is
  // safe.
  if (legacy) {
    if (migrateLegacy) {
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
    } else {
      console.warn(
        `\nLegacy combined alert rule "${LEGACY_ALERT_NAME}" still exists (id=${legacy.id}).\n` +
          `It is now superseded by the per-side fetch/playback rules above. Either:\n` +
          `  - Disable or delete it manually in the Sentry UI:\n` +
          `      ${SENTRY_HOST}/organizations/${org}/alerts/rules/details/${legacy.id}/\n` +
          `  - Or re-run this script with ${MIGRATE_LEGACY_FLAG}=1 to delete it automatically\n` +
          `    (safe now that both per-side replacements are confirmed in place).\n`,
      );
    }
  }

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
