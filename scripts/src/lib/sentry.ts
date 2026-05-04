export const SENTRY_HOST = process.env.SENTRY_HOST ?? "https://sentry.io";

export interface SentryProject {
  id: string;
  slug: string;
}

export interface SentryDashboard {
  id: string;
  title: string;
}

export interface SentryAlertRule {
  id: string;
  name: string;
}

export type DetectionType = "dynamic" | "static";

export interface SentryEnv {
  token: string;
  org: string;
  project: string;
}

export function requireEnv(): SentryEnv {
  const token = process.env.SENTRY_AUTH_TOKEN;
  const org = process.env.SENTRY_ORG;
  const project = process.env.SENTRY_PROJECT;
  const missing: string[] = [];
  if (!token) missing.push("SENTRY_AUTH_TOKEN");
  if (!org) missing.push("SENTRY_ORG");
  if (!project) missing.push("SENTRY_PROJECT");
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
  return { token: token!, org: org!, project: project! };
}

export async function sentryFetch<T>(
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

export async function getProject(
  token: string,
  org: string,
  projectSlug: string,
): Promise<SentryProject> {
  return sentryFetch<SentryProject>(
    token,
    `/projects/${encodeURIComponent(org)}/${encodeURIComponent(projectSlug)}/`,
  );
}

export async function findExistingDashboard(
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

export async function findExistingAlertRule(
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

export async function deleteAlertRule(
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

// Generic detection-mode env-flag parser shared by every Walk Mode dashboard
// script. Each script owns its own env var name (e.g.
// PREFETCH_ALERT_DETECTION_TYPE, AUDIO_FALLBACK_ALERT_DETECTION_TYPE) and
// passes it in here so the parsing / warn-on-unknown / default-to-dynamic
// behavior stays identical across scripts.
export function getDetectionType(envVarName: string): DetectionType {
  const raw = (process.env[envVarName] ?? "").trim().toLowerCase();
  if (raw === "static") return "static";
  if (raw === "" || raw === "dynamic") return "dynamic";
  console.warn(
    `Unknown ${envVarName}=${raw} — defaulting to "dynamic". Supported values: "dynamic" | "static".`,
  );
  return "dynamic";
}

// Spec consumed by buildAlertRuleBody / upsertAlertRule. Captures everything a
// Walk Mode metric alert needs to be expressed independently of which script
// owns it: name, the metric query/aggregate, detection-mode-specific knobs
// (dynamic sensitivity vs static thresholds), and an optional rationale that
// gets appended to the upsert log message.
export interface AlertRuleSpec {
  name: string;
  aggregate: string;
  query: string;
  // 1 = below-threshold (alert when count drops), 0 = above-threshold (alert
  // when count climbs). Matches Sentry's wire format.
  thresholdType: 0 | 1;
  // Window in minutes (Sentry's `timeWindow`). 60 = 1h is the Walk Mode
  // standard.
  timeWindow: number;
  dynamicSensitivity: "low" | "medium" | "high";
  staticCritical: number;
  staticWarning: number;
  staticResolve: number;
  rationale?: string;
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

export function buildAlertRuleBody(
  spec: AlertRuleSpec,
  detectionType: DetectionType,
  projectSlug: string,
): Record<string, unknown> {
  const base: AlertRuleBodyBase = {
    name: spec.name,
    aggregate: spec.aggregate,
    dataset: "metrics",
    query: spec.query,
    timeWindow: spec.timeWindow,
    thresholdType: spec.thresholdType,
    projects: [projectSlug],
    environment: null,
    comparisonDelta: null,
  };

  if (detectionType === "dynamic") {
    // Sentry Anomaly Detection. The detector learns the metric's hourly/daily
    // baseline and pages when the count deviates significantly. Triggers in
    // dynamic mode use alertThreshold=0 — Sentry ignores the numeric threshold
    // and uses the trained anomaly score instead. Sensitivity (low/medium/
    // high) is what actually controls how easily the alert fires. seasonality
    // "auto" lets Sentry pick hourly vs daily vs weekly periodicity.
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

  // Static (legacy) escape hatch. Absolute thresholds — direction is governed
  // by spec.thresholdType.
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

function summarizeAlertRule(
  spec: AlertRuleSpec,
  detectionType: DetectionType,
): string {
  if (detectionType === "dynamic") {
    return `, sensitivity=${spec.dynamicSensitivity}`;
  }
  // Use "=<" prefix when the alert fires below the threshold so the log reads
  // naturally ("critical=<60" = "critical when below 60"). For above-threshold
  // alerts the conventional "critical=15" reads as "critical at threshold 15".
  const op = spec.thresholdType === 1 ? "=<" : "=";
  return `, critical${op}${spec.staticCritical}/warning${op}${spec.staticWarning}`;
}

// Idempotent upsert: PUT to update an existing rule (so re-running migrates
// drift in thresholds / detection mode onto the current spec without manual
// intervention) or POST to create. On create, also prints the standard
// "no notification actions" warning so operators remember to wire up Slack/
// email in the Sentry UI.
export async function upsertAlertRule(
  token: string,
  org: string,
  projectSlug: string,
  spec: AlertRuleSpec,
  detectionType: DetectionType,
): Promise<SentryAlertRule> {
  const body = buildAlertRuleBody(spec, detectionType, projectSlug);
  const existing = await findExistingAlertRule(token, org, spec.name);
  const summary = summarizeAlertRule(spec, detectionType);
  const rationaleSuffix = spec.rationale ? ` Rationale: ${spec.rationale}` : "";

  if (existing) {
    const updated = await sentryFetch<SentryAlertRule>(
      token,
      `/organizations/${encodeURIComponent(org)}/alert-rules/${encodeURIComponent(existing.id)}/`,
      { method: "PUT", body: JSON.stringify(body) },
    );
    console.log(
      `Updated alert rule "${spec.name}" (id=${updated.id}) → detectionType=${detectionType}${summary}.${rationaleSuffix}`,
    );
    return updated;
  }

  const created = await sentryFetch<SentryAlertRule>(
    token,
    `/organizations/${encodeURIComponent(org)}/alert-rules/`,
    { method: "POST", body: JSON.stringify(body) },
  );
  console.log(
    `Created alert rule "${spec.name}" (id=${created.id}) → detectionType=${detectionType}${summary}.${rationaleSuffix}`,
  );
  console.warn(
    `NOTE: Alert was created with no notification actions. Add a Slack/Email\n` +
      `target in the Sentry UI so the on-call channel actually gets paged:\n` +
      `  ${SENTRY_HOST}/organizations/${org}/alerts/rules/details/${created.id}/`,
  );
  return created;
}
