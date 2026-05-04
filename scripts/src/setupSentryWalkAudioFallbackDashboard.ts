import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SENTRY_HOST = process.env.SENTRY_HOST ?? "https://sentry.io";
const SENTRY_AUTH_TOKEN = process.env.SENTRY_AUTH_TOKEN;
const SENTRY_ORG = process.env.SENTRY_ORG;
const SENTRY_PROJECT = process.env.SENTRY_PROJECT;

const FALLBACK_METRIC_MRI = "c:custom/narration.audio_fallback@none";
const TOTAL_METRIC_MRI = "c:custom/narration.prefetch_event@none";
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
const LEGACY_ALERT_NAME = "Walk Mode audio fallback rate";

const FETCH_ALERT_NAME = "Walk Mode audio fallback rate (fetch)";
const PLAYBACK_ALERT_NAME = "Walk Mode audio fallback rate (playback)";

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
            name: "B",
            fields: [`sum(${TOTAL_METRIC_MRI})`],
            aggregates: [`sum(${TOTAL_METRIC_MRI})`],
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

interface AlertRuleSpec {
  name: string;
  reasons: string[];
  critical: number;
  warning: number;
  resolve: number;
  rationale: string;
}

async function createOneAlertRule(
  token: string,
  org: string,
  projectSlug: string,
  spec: AlertRuleSpec,
): Promise<SentryAlertRule> {
  const existing = await findExistingAlertRule(token, org, spec.name);
  if (existing) {
    console.log(
      `Alert rule "${spec.name}" already exists (id=${existing.id}), reusing.`,
    );
    return existing;
  }

  // Sentry Metric Alerts trigger on a single aggregate value, not on an
  // equation across two metrics. We alert on absolute fallback volume
  // (sum(narration.audio_fallback) over 1h) filtered by reason group, so
  // a fetch-side spike and a playback-side spike each get their own
  // calibrated threshold instead of being averaged into one combined
  // count. The dashboard's "Audio fallback rate %" panel carries the
  // true rate-based view for humans, and the minimum-volume guard is
  // implicit: low traffic naturally keeps the count under threshold.
  const body = {
    name: spec.name,
    aggregate: FALLBACK_AGGREGATE_FOR_ALERT,
    dataset: "metrics",
    query: `reason:[${spec.reasons.join(",")}]`,
    timeWindow: 60,
    thresholdType: 0,
    resolveThreshold: spec.resolve,
    triggers: [
      {
        label: "critical",
        alertThreshold: spec.critical,
        actions: [],
      },
      {
        label: "warning",
        alertThreshold: spec.warning,
        actions: [],
      },
    ],
    projects: [projectSlug],
    environment: null,
    comparisonDelta: null,
  };

  const created = await sentryFetch<SentryAlertRule>(
    token,
    `/organizations/${encodeURIComponent(org)}/alert-rules/`,
    { method: "POST", body: JSON.stringify(body) },
  );
  console.log(
    `Created alert rule "${spec.name}" (id=${created.id}). Rationale: ${spec.rationale}`,
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
  // Warn (don't auto-delete) if the pre-split combined rule still exists.
  const legacy = await findExistingAlertRule(token, org, LEGACY_ALERT_NAME);
  if (legacy) {
    console.warn(
      `\nLegacy combined alert rule "${LEGACY_ALERT_NAME}" still exists (id=${legacy.id}).\n` +
        `It is now superseded by the per-side fetch/playback rules below. Disable or\n` +
        `delete it manually so you don't get double-paged:\n` +
        `  ${SENTRY_HOST}/organizations/${org}/alerts/rules/details/${legacy.id}/\n`,
    );
  }

  const fetchSpec: AlertRuleSpec = {
    name: FETCH_ALERT_NAME,
    reasons: FETCH_REASONS,
    critical: 15,
    warning: 8,
    resolve: 5,
    rationale:
      "Fetch-side reasons (write_failure | endpoint_error | bad_response). " +
      "Thresholds carried over from the original combined rule, which was " +
      "originally calibrated against fetch-only volume; treat as approximate " +
      "until real hourly walk volume confirms.",
  };

  const playbackSpec: AlertRuleSpec = {
    name: PLAYBACK_ALERT_NAME,
    reasons: PLAYBACK_REASONS,
    critical: 10,
    warning: 5,
    resolve: 3,
    rationale:
      "Playback-side reasons (playback_create | playback_play | " +
      "playback_status_error | playback_watchdog). Set tighter than the " +
      "fetch side because a sustained playback failure rate almost always " +
      "indicates an expo-audio or OS audio-stack regression worth catching " +
      "early. Approximate placeholder — retune once real volume is observed.",
  };

  const fetchRule = await createOneAlertRule(token, org, projectSlug, fetchSpec);
  const playbackRule = await createOneAlertRule(
    token,
    org,
    projectSlug,
    playbackSpec,
  );
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
