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
  getDetectionType,
  upsertAlertRule,
} from "./lib/sentry.js";

const METRIC_MRI = "c:custom/narration.prefetch_event@none";
const METRIC_NAME_FOR_ALERT = "sum(c:custom/narration.prefetch_event@none)";

const ALERT_NAME = "Walk Mode prefetch hit rate";

// Detection mode for the prefetch hit-rate alert rule.
//
//   "dynamic" (default) — Sentry Anomaly Detection. The detector learns the
//                         metric's hourly/daily baseline (HIT count over a 1h
//                         window) and pages only when the count is genuinely
//                         anomalously low against that baseline. This implicitly
//                         normalizes against walk volume: a quiet hour with a
//                         100% hit rate but only 50 walks no longer looks like
//                         a critical regression, and a busy hour where the hit
//                         rate has actually collapsed but volume kept the count
//                         above the legacy floor no longer stays silent. As
//                         close as Sentry currently gets to firing on a true
//                         HIT / (HIT+MISS+STALE_DISCARD) ratio without
//                         supporting cross-query equation alerts on custom
//                         metrics. Mirrors the dynamic-detection migration
//                         applied to the audio-fallback alerts in Task #229.
//
//   "static"            — Legacy absolute-count thresholds (HIT count <60
//                         critical, <75 warning, resolve >=75). Use this
//                         escape hatch only if the org's Sentry plan does not
//                         support anomaly detection (Business plan or above)
//                         or if you need to bridge a gap while the dynamic
//                         alert gathers its ~7-day baseline.
//
// Set via the PREFETCH_ALERT_DETECTION_TYPE env var; defaults to "dynamic".
const DETECTION_TYPE_ENV = "PREFETCH_ALERT_DETECTION_TYPE";

// Dynamic-mode sensitivity. Sentry maps this onto an internal anomaly score
// threshold; "high" pages on smaller deviations, "low" only on large ones.
// "medium" mirrors the symmetric tuning used on the fetch-side audio-fallback
// alert in Task #229: catch sustained regressions without paging on every
// transient blip in third-party dependencies (a brief OpenAI / network blip
// can dent the prefetch hit rate the same way it dents the audio-fallback
// rate, and we don't want to wake the on-call on noise).
const DYNAMIC_SENSITIVITY: "low" | "medium" | "high" = "medium";

// Static-mode legacy thresholds. Only used when PREFETCH_ALERT_DETECTION_TYPE=static.
// Carried over from the original absolute-count rule (HIT count <60 critical,
// <75 warning, resolve >=75) so the static fallback behaves exactly as before.
const STATIC_CRITICAL = 60;
const STATIC_WARNING = 75;
const STATIC_RESOLVE = 75;

const ALERT_SPEC: AlertRuleSpec = {
  name: ALERT_NAME,
  aggregate: METRIC_NAME_FOR_ALERT,
  query: "event:HIT",
  // Below-threshold direction. In dynamic mode this tells Sentry to page on
  // anomalously LOW HIT counts (the regression direction we care about — a
  // collapse in cache effectiveness). In static mode it preserves the
  // legacy "alert when HIT count drops below the floor" semantics.
  thresholdType: 1,
  // 1h window: long enough to smooth out a single bad minute, short enough
  // to react before a regression eats the whole shift. Matches the static
  // baseline thresholds were originally calibrated against, and matches the
  // audio-fallback alerts so all Walk Mode pages share the same cadence.
  timeWindow: 60,
  dynamicSensitivity: DYNAMIC_SENSITIVITY,
  staticCritical: STATIC_CRITICAL,
  staticWarning: STATIC_WARNING,
  staticResolve: STATIC_RESOLVE,
};

async function createDashboard(
  token: string,
  org: string,
  projectId: string,
): Promise<SentryDashboard> {
  const title = "Walk Mode Prefetch";
  const existing = await findExistingDashboard(token, org, title);
  if (existing) {
    console.log(`Dashboard "${title}" already exists (id=${existing.id}), reusing.`);
    return existing;
  }

  const body = {
    title,
    widgets: [
      {
        title: "Prefetch events by outcome",
        displayType: "area",
        interval: "5m",
        widgetType: "custom-metrics",
        layout: { x: 0, y: 0, w: 2, h: 2, minH: 2 },
        queries: [
          {
            name: "",
            fields: [`sum(${METRIC_MRI})`],
            aggregates: [`sum(${METRIC_MRI})`],
            columns: ["event"],
            conditions: "",
            orderby: "",
          },
        ],
      },
      {
        title: "Prefetch hit rate %",
        displayType: "line",
        interval: "5m",
        widgetType: "custom-metrics",
        layout: { x: 2, y: 0, w: 2, h: 2, minH: 2 },
        queries: [
          {
            name: "A",
            fields: [`sum(${METRIC_MRI})`],
            aggregates: [`sum(${METRIC_MRI})`],
            columns: [],
            conditions: "event:HIT",
            orderby: "",
          },
          {
            name: "B",
            fields: [`sum(${METRIC_MRI})`],
            aggregates: [`sum(${METRIC_MRI})`],
            columns: [],
            conditions: "event:MISS",
            orderby: "",
          },
          {
            name: "C",
            fields: [`sum(${METRIC_MRI})`],
            aggregates: [`sum(${METRIC_MRI})`],
            columns: [],
            conditions: "event:STALE_DISCARD",
            orderby: "",
          },
          {
            name: "Hit rate %",
            fields: ["equation|100 * a / (a + b + c)"],
            aggregates: ["equation|100 * a / (a + b + c)"],
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

async function createAlertRule(
  token: string,
  org: string,
  projectSlug: string,
): Promise<SentryAlertRule> {
  const detectionType = getDetectionType(DETECTION_TYPE_ENV);

  console.log(
    `Prefetch hit-rate alert detection mode: ${detectionType}` +
      (detectionType === "dynamic"
        ? ` (Sentry Anomaly Detection — sensitivity=${DYNAMIC_SENSITIVITY}, learns ` +
          `hourly/daily baseline; ~7 days of data needed before it pages reliably)`
        : ` (legacy absolute HIT-count thresholds critical=<${STATIC_CRITICAL}/warning=<${STATIC_WARNING}; ` +
          `set ${DETECTION_TYPE_ENV}=dynamic to switch back)`),
  );

  return upsertAlertRule(token, org, projectSlug, ALERT_SPEC, detectionType);
}

async function patchReplitMd(
  org: string,
  dashboardId: string,
  alertRuleId: string,
): Promise<void> {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const replitMdPath = resolve(repoRoot, "replit.md");
  const before = await readFile(replitMdPath, "utf8");

  const dashboardUrl = `${SENTRY_HOST}/organizations/${org}/dashboard/${dashboardId}/`;
  const alertUrl = `${SENTRY_HOST}/organizations/${org}/alerts/rules/details/${alertRuleId}/`;

  const dashboardLine = `    - **Dashboard URL**: ${dashboardUrl}`;
  const alertLine = `    - **Alert URL**: ${alertUrl}`;

  const after = before
    .replace(
      /^ {4}- \*\*Dashboard URL\*\*:.*$/m,
      dashboardLine,
    )
    .replace(/^ {4}- \*\*Alert URL\*\*:.*$/m, alertLine);

  if (after === before) {
    console.warn(
      "replit.md was not modified — could not find the Dashboard URL / Alert URL placeholder lines. " +
        "Paste these manually:\n" +
        `  ${dashboardUrl}\n  ${alertUrl}`,
    );
    return;
  }

  await writeFile(replitMdPath, after, "utf8");
  console.log(`Updated replit.md with dashboard + alert URLs.`);
}

async function main(): Promise<void> {
  const { token, org, project: projectSlug } = requireEnv();

  console.log(`Using Sentry org=${org} project=${projectSlug}`);
  const project = await getProject(token, org, projectSlug);

  const dashboard = await createDashboard(token, org, project.id);
  const alertRule = await createAlertRule(token, org, projectSlug);

  await patchReplitMd(org, dashboard.id, alertRule.id);

  console.log("\nDone. Verify in Sentry:");
  console.log(`  Dashboard: ${SENTRY_HOST}/organizations/${org}/dashboard/${dashboard.id}/`);
  console.log(`  Alert:     ${SENTRY_HOST}/organizations/${org}/alerts/rules/details/${alertRule.id}/`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
