import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SENTRY_HOST = process.env.SENTRY_HOST ?? "https://sentry.io";
const SENTRY_AUTH_TOKEN = process.env.SENTRY_AUTH_TOKEN;
const SENTRY_ORG = process.env.SENTRY_ORG;
const SENTRY_PROJECT = process.env.SENTRY_PROJECT;

const METRIC_MRI = "c:custom/narration.prefetch_event@none";
const METRIC_NAME_FOR_ALERT = "sum(c:custom/narration.prefetch_event@none)";

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

async function createAlertRule(
  token: string,
  org: string,
  projectSlug: string,
): Promise<SentryAlertRule> {
  const name = "Walk Mode prefetch hit rate";
  const existing = await findExistingAlertRule(token, org, name);
  if (existing) {
    console.log(`Alert rule "${name}" already exists (id=${existing.id}), reusing.`);
    return existing;
  }

  const body = {
    name,
    aggregate: METRIC_NAME_FOR_ALERT,
    dataset: "metrics",
    query: "event:HIT",
    timeWindow: 60,
    thresholdType: 1,
    resolveThreshold: 75,
    triggers: [
      {
        label: "critical",
        alertThreshold: 60,
        actions: [],
      },
      {
        label: "warning",
        alertThreshold: 75,
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
  console.log(`Created alert rule "${name}" (id=${created.id}).`);
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
