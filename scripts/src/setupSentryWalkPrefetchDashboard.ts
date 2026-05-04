import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SENTRY_HOST = process.env.SENTRY_HOST ?? "https://sentry.io";
const SENTRY_AUTH_TOKEN = process.env.SENTRY_AUTH_TOKEN;
const SENTRY_ORG = process.env.SENTRY_ORG;
const SENTRY_PROJECT = process.env.SENTRY_PROJECT;

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
  detectionType: DetectionType,
  projectSlug: string,
): Record<string, unknown> {
  const base: AlertRuleBodyBase = {
    name: ALERT_NAME,
    aggregate: METRIC_NAME_FOR_ALERT,
    dataset: "metrics",
    query: "event:HIT",
    // 1h window: long enough to smooth out a single bad minute, short enough
    // to react before a regression eats the whole shift. Matches the static
    // baseline thresholds were originally calibrated against, and matches the
    // audio-fallback alerts so all Walk Mode pages share the same cadence.
    timeWindow: 60,
    // Below-threshold direction. In dynamic mode this tells Sentry to page on
    // anomalously LOW HIT counts (the regression direction we care about — a
    // collapse in cache effectiveness). In static mode it preserves the
    // legacy "alert when HIT count drops below the floor" semantics.
    thresholdType: 1,
    projects: [projectSlug],
    environment: null,
    comparisonDelta: null,
  };

  if (detectionType === "dynamic") {
    // Sentry Anomaly Detection. The detector learns the HIT count's
    // hourly/daily baseline and pages when the count deviates significantly
    // below it. Triggers in dynamic mode use alertThreshold=0 — Sentry
    // ignores the numeric threshold and uses the trained anomaly score
    // instead. Sensitivity (low/medium/high) is what actually controls how
    // easily the alert fires. seasonality "auto" lets Sentry pick hourly vs
    // daily vs weekly periodicity from the data.
    return {
      ...base,
      detectionType: "dynamic",
      sensitivity: DYNAMIC_SENSITIVITY,
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

  // Static (legacy) escape hatch. Absolute HIT-count thresholds — the same
  // numbers the rule was originally created with.
  return {
    ...base,
    detectionType: "static",
    resolveThreshold: STATIC_RESOLVE,
    triggers: [
      {
        label: "critical",
        alertThreshold: STATIC_CRITICAL,
        actions: [],
      },
      {
        label: "warning",
        alertThreshold: STATIC_WARNING,
        actions: [],
      },
    ],
  };
}

async function upsertAlertRule(
  token: string,
  org: string,
  projectSlug: string,
): Promise<SentryAlertRule> {
  const detectionType = getDetectionType();

  console.log(
    `Prefetch hit-rate alert detection mode: ${detectionType}` +
      (detectionType === "dynamic"
        ? ` (Sentry Anomaly Detection — sensitivity=${DYNAMIC_SENSITIVITY}, learns ` +
          `hourly/daily baseline; ~7 days of data needed before it pages reliably)`
        : ` (legacy absolute HIT-count thresholds critical=<${STATIC_CRITICAL}/warning=<${STATIC_WARNING}; ` +
          `set ${DETECTION_TYPE_ENV}=dynamic to switch back)`),
  );

  const body = buildAlertRuleBody(detectionType, projectSlug);
  const existing = await findExistingAlertRule(token, org, ALERT_NAME);

  if (existing) {
    // PUT to update so re-running the script migrates a legacy static rule
    // (or any drift in thresholds / detection mode) onto the current spec
    // without manual intervention.
    const updated = await sentryFetch<SentryAlertRule>(
      token,
      `/organizations/${encodeURIComponent(org)}/alert-rules/${encodeURIComponent(existing.id)}/`,
      { method: "PUT", body: JSON.stringify(body) },
    );
    console.log(
      `Updated alert rule "${ALERT_NAME}" (id=${updated.id}) → detectionType=${detectionType}` +
        (detectionType === "dynamic"
          ? `, sensitivity=${DYNAMIC_SENSITIVITY}`
          : `, critical=<${STATIC_CRITICAL}/warning=<${STATIC_WARNING}`) +
        `.`,
    );
    return updated;
  }

  const created = await sentryFetch<SentryAlertRule>(
    token,
    `/organizations/${encodeURIComponent(org)}/alert-rules/`,
    { method: "POST", body: JSON.stringify(body) },
  );
  console.log(
    `Created alert rule "${ALERT_NAME}" (id=${created.id}) → detectionType=${detectionType}` +
      (detectionType === "dynamic"
        ? `, sensitivity=${DYNAMIC_SENSITIVITY}`
        : `, critical=<${STATIC_CRITICAL}/warning=<${STATIC_WARNING}`) +
      `.`,
  );
  console.warn(
    `NOTE: Alert was created with no notification actions. Add a Slack/Email\n` +
      `target in the Sentry UI so the on-call channel actually gets paged:\n` +
      `  ${SENTRY_HOST}/organizations/${org}/alerts/rules/details/${created.id}/`,
  );
  return created;
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
  const alertRule = await upsertAlertRule(token, org, projectSlug);

  await patchReplitMd(org, dashboard.id, alertRule.id);

  console.log("\nDone. Verify in Sentry:");
  console.log(`  Dashboard: ${SENTRY_HOST}/organizations/${org}/dashboard/${dashboard.id}/`);
  console.log(`  Alert:     ${SENTRY_HOST}/organizations/${org}/alerts/rules/details/${alertRule.id}/`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
