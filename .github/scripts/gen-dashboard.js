"use strict";

const fs = require("fs");

const histPath = "/tmp/warn-history/warn-history.json";
let history = [];
try {
  history = JSON.parse(fs.readFileSync(histPath, "utf8"));
} catch (e) {
  console.error("Could not read warn-history:", e.message);
}

// Multi-branch build-time data (collected by CI step; absent on first run).
let allBranches = {};
try {
  allBranches = JSON.parse(
    fs.readFileSync("/tmp/branch-histories/all-branches.json", "utf8"),
  );
} catch (_) {
  // File is optional — silently continue without cross-branch section.
}

const branch = process.env.BRANCH || "unknown";
const runUrl = process.env.RUN_URL || "#";
const generatedAt = new Date().toUTCString();
const n = history.length;

// Chart dimensions (shared)
const W = 740,
  H = 330;
const mt = 30,
  mr = 90,
  mb = 80,
  ml = 60;
const pw = W - ml - mr;
const ph = H - mt - mb;

function xPos(i) {
  return ml + (n <= 1 ? pw / 2 : (i / (n - 1)) * pw);
}

function fmtTime(s) {
  const min = Math.floor(s / 60),
    sec = s % 60;
  return min > 0 ? `${min}m ${sec}s` : `${sec}s`;
}

// ── Chart 1: warnings + total build time ─────────────────────────────────────

const lintVals = history.map((e) => (e.lint != null ? e.lint : null));
const tcVals = history.map((e) => (e.tc != null ? e.tc : null));

// Per-job build time series (null for old entries that pre-date these fields).
const lintSVals = history.map((e) =>
  e.lint_s != null && e.lint_s > 0 ? e.lint_s : null,
);
const tcSVals = history.map((e) =>
  e.tc_s != null && e.tc_s > 0 ? e.tc_s : null,
);
const formatSVals = history.map((e) =>
  e.format_s != null && e.format_s > 0 ? e.format_s : null,
);
const buildJobSVals = history.map((e) =>
  e.build_job_s != null && e.build_job_s > 0 ? e.build_job_s : null,
);

const maxW = Math.max(
  1,
  ...lintVals.filter((v) => v !== null),
  ...tcVals.filter((v) => v !== null),
);
const maxB = Math.max(
  1,
  ...lintSVals.filter((v) => v !== null),
  ...tcSVals.filter((v) => v !== null),
  ...formatSVals.filter((v) => v !== null),
  ...buildJobSVals.filter((v) => v !== null),
);

function yWarn(v) {
  return mt + ph - (v / maxW) * ph;
}
function yBuild(v) {
  return mt + ph - (v / maxB) * ph;
}

// Break series into connected segments, skipping null gaps
function segments(vals) {
  const segs = [];
  let seg = [];
  for (let i = 0; i < n; i++) {
    if (vals[i] !== null) {
      seg.push(i);
    } else {
      if (seg.length > 1) segs.push([...seg]);
      seg = [];
    }
  }
  if (seg.length > 1) segs.push(seg);
  return segs;
}

function polylines(vals, yFn, color, dash) {
  return segments(vals)
    .map((seg) => {
      const pts = seg
        .map((i) => `${xPos(i).toFixed(1)},${yFn(vals[i]).toFixed(1)}`)
        .join(" ");
      return `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;
    })
    .join("");
}

function circles(vals, yFn, color, labelFn) {
  return vals
    .map((v, i) => {
      if (v === null) return "";
      const cx = xPos(i).toFixed(1),
        cy = yFn(v).toFixed(1);
      const label = labelFn ? labelFn(v) : String(v);
      const tip = `${history[i].shortSha} (${history[i].ts.slice(0, 10)}): ${label}`;
      return `<circle cx="${cx}" cy="${cy}" r="4.5" fill="${color}" stroke="white" stroke-width="1.5"><title>${tip}</title></circle>`;
    })
    .join("");
}

// Left axis ticks (warnings)
function leftAxis() {
  const step = Math.max(1, Math.ceil(maxW / 5));
  let out = "";
  for (let v = 0; v <= maxW + step; v += step) {
    if (v > maxW + step * 0.5) break;
    const y = yWarn(v).toFixed(1);
    out += `<line x1="${ml}" y1="${y}" x2="${ml + pw}" y2="${y}" stroke="#ebebeb" stroke-width="1"/>`;
    out += `<text x="${ml - 8}" y="${parseFloat(y) + 4}" font-size="11" text-anchor="end" fill="#666">${v}</text>`;
  }
  return out;
}

// Right axis ticks (build time)
function rightAxis() {
  const step = Math.max(1, Math.ceil(maxB / 5));
  const rx = ml + pw;
  let out = "";
  for (let v = 0; v <= maxB + step; v += step) {
    if (v > maxB + step * 0.5) break;
    const y = yBuild(v).toFixed(1);
    out += `<text x="${rx + 7}" y="${parseFloat(y) + 4}" font-size="10" text-anchor="start" fill="#999">${fmtTime(v)}</text>`;
  }
  return out;
}

// X axis labels (rotated)
function xLabels() {
  return history
    .map((e, i) => {
      const x = xPos(i).toFixed(1);
      const y = (mt + ph + 13).toFixed(1);
      return `<text x="${x}" y="${y}" font-size="10" text-anchor="end" fill="#666" transform="rotate(-45,${x},${y})">${e.shortSha} ${e.ts.slice(5, 10)}</text>`;
    })
    .join("");
}

const lx = ml,
  ly = mt - 14;
const legend1 = [
  `<rect x="${lx}" y="${ly - 8}" width="12" height="12" rx="2" fill="#e67e22"/>`,
  `<text x="${lx + 16}" y="${ly + 2}" font-size="11" fill="#333">Lint warnings</text>`,
  `<rect x="${lx + 105}" y="${ly - 8}" width="12" height="12" rx="2" fill="#3498db"/>`,
  `<text x="${lx + 121}" y="${ly + 2}" font-size="11" fill="#333">TS warnings</text>`,
  `<line x1="${lx + 210}" y1="${ly - 2}" x2="${lx + 222}" y2="${ly - 2}" stroke="#9b59b6" stroke-width="2.2" stroke-dasharray="5,3"/>`,
  `<circle cx="${lx + 216}" cy="${ly - 2}" r="3.5" fill="#9b59b6" stroke="white" stroke-width="1"/>`,
  `<text x="${lx + 226}" y="${ly + 2}" font-size="11" fill="#333">Lint ⏱</text>`,
  `<line x1="${lx + 278}" y1="${ly - 2}" x2="${lx + 290}" y2="${ly - 2}" stroke="#e74c3c" stroke-width="2.2" stroke-dasharray="5,3"/>`,
  `<circle cx="${lx + 284}" cy="${ly - 2}" r="3.5" fill="#e74c3c" stroke="white" stroke-width="1"/>`,
  `<text x="${lx + 294}" y="${ly + 2}" font-size="11" fill="#333">TC ⏱</text>`,
  `<line x1="${lx + 338}" y1="${ly - 2}" x2="${lx + 350}" y2="${ly - 2}" stroke="#f39c12" stroke-width="2.2" stroke-dasharray="5,3"/>`,
  `<circle cx="${lx + 344}" cy="${ly - 2}" r="3.5" fill="#f39c12" stroke="white" stroke-width="1"/>`,
  `<text x="${lx + 354}" y="${ly + 2}" font-size="11" fill="#333">Fmt ⏱</text>`,
  `<line x1="${lx + 398}" y1="${ly - 2}" x2="${lx + 410}" y2="${ly - 2}" stroke="#27ae60" stroke-width="2.2" stroke-dasharray="5,3"/>`,
  `<circle cx="${lx + 404}" cy="${ly - 2}" r="3.5" fill="#27ae60" stroke="white" stroke-width="1"/>`,
  `<text x="${lx + 414}" y="${ly + 2}" font-size="11" fill="#333">Build ⏱ (right axis)</text>`,
].join("");

const noDataMsg =
  n === 0
    ? `<text x="${W / 2}" y="${H / 2}" font-size="14" text-anchor="middle" fill="#999">No history yet — need at least one completed run.</text>`
    : "";

const svg1 = [
  `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" font-family="ui-monospace,monospace">`,
  legend1,
  `<line x1="${ml}" y1="${mt}" x2="${ml}" y2="${mt + ph}" stroke="#ccc" stroke-width="1"/>`,
  `<line x1="${ml}" y1="${mt + ph}" x2="${ml + pw}" y2="${mt + ph}" stroke="#ccc" stroke-width="1"/>`,
  `<line x1="${ml + pw}" y1="${mt}" x2="${ml + pw}" y2="${mt + ph}" stroke="#ddd" stroke-width="1" stroke-dasharray="4,3"/>`,
  `<text x="${ml - 42}" y="${mt + ph / 2}" font-size="11" fill="#666" transform="rotate(-90,${ml - 42},${mt + ph / 2})" text-anchor="middle">Warnings</text>`,
  `<text x="${ml + pw + 60}" y="${mt + ph / 2}" font-size="11" fill="#aaa" transform="rotate(90,${ml + pw + 60},${mt + ph / 2})" text-anchor="middle">Job time</text>`,
  n > 0 ? leftAxis() : "",
  n > 0 ? rightAxis() : "",
  polylines(lintVals, yWarn, "#e67e22"),
  polylines(tcVals, yWarn, "#3498db"),
  polylines(lintSVals, yBuild, "#9b59b6", "6,3"),
  polylines(tcSVals, yBuild, "#e74c3c", "6,3"),
  polylines(formatSVals, yBuild, "#f39c12", "6,3"),
  polylines(buildJobSVals, yBuild, "#27ae60", "6,3"),
  circles(lintVals, yWarn, "#e67e22"),
  circles(tcVals, yWarn, "#3498db"),
  circles(lintSVals, yBuild, "#9b59b6", fmtTime),
  circles(tcSVals, yBuild, "#e74c3c", fmtTime),
  circles(formatSVals, yBuild, "#f39c12", fmtTime),
  circles(buildJobSVals, yBuild, "#27ae60", fmtTime),
  n > 0 ? xLabels() : "",
  noDataMsg,
  "</svg>",
].join("\n");

// ── Chart 2: per-job timing stacked bar chart ─────────────────────────────────

const JOB_KEYS = ["install_s", "lint_s", "tc_s", "format_s", "build_job_s"];
const JOB_LABELS = ["Install", "Lint", "TC", "Format", "Build"];
const JOB_COLORS = ["#9b59b6", "#e67e22", "#3498db", "#2ecc71", "#e74c3c"];

// Check whether any entry has per-job fields (lint_s is present in all new entries)
const hasJobData = history.some((e) => e.lint_s != null);

// Per-run stacked values
const barData = history.map((e) =>
  JOB_KEYS.map((k) => (e[k] != null && e[k] > 0 ? e[k] : 0)),
);
const barTotals = barData.map((d) => d.reduce((a, b) => a + b, 0));
const maxBarTotal = Math.max(1, ...barTotals);

// Band scale: divide plot width into n equal slots so bars stay within bounds.
// Each bar is centred in its slot; barW is 70% of the slot width.
const bandW = n <= 1 ? pw : pw / n;
const barW = Math.max(4, bandW * 0.7);

function xPos2(i) {
  return n <= 1 ? ml + pw / 2 : ml + (i + 0.5) * bandW;
}

function yJobTime(v) {
  return mt + ph - (v / maxBarTotal) * ph;
}

// Y axis ticks (time) for stacked bar chart
function barLeftAxis() {
  const step = Math.max(1, Math.ceil(maxBarTotal / 5));
  let out = "";
  for (let v = 0; v <= maxBarTotal + step; v += step) {
    if (v > maxBarTotal + step * 0.5) break;
    const y = yJobTime(v).toFixed(1);
    out += `<line x1="${ml}" y1="${y}" x2="${ml + pw}" y2="${y}" stroke="#ebebeb" stroke-width="1"/>`;
    out += `<text x="${ml - 8}" y="${parseFloat(y) + 4}" font-size="10" text-anchor="end" fill="#666">${fmtTime(v)}</text>`;
  }
  return out;
}

function stackedBars() {
  if (!hasJobData) return "";
  let out = "";
  for (let i = 0; i < n; i++) {
    const cx = xPos2(i);
    const x = cx - barW / 2;
    let accum = 0;
    for (let j = 0; j < JOB_KEYS.length; j++) {
      const val = barData[i][j];
      if (val <= 0) continue;
      const segH = (val / maxBarTotal) * ph;
      const y = yJobTime(accum + val);
      const tip = `${history[i].shortSha} (${history[i].ts.slice(0, 10)}) — ${JOB_LABELS[j]}: ${fmtTime(val)}`;
      out += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${segH.toFixed(1)}" fill="${JOB_COLORS[j]}" opacity="0.85" rx="1"><title>${tip}</title></rect>`;
      accum += val;
    }
    // Total label above bar
    if (barTotals[i] > 0) {
      const labelY = (yJobTime(barTotals[i]) - 4).toFixed(1);
      out += `<text x="${cx.toFixed(1)}" y="${labelY}" font-size="9" text-anchor="middle" fill="#555">${fmtTime(barTotals[i])}</text>`;
    }
  }
  return out;
}

// Legend for stacked bar chart
const legend2 = JOB_LABELS.map((label, j) => {
  const lx2 = ml + j * 118;
  const ly2 = mt - 14;
  return [
    `<rect x="${lx2}" y="${ly2 - 8}" width="12" height="12" rx="2" fill="${JOB_COLORS[j]}"/>`,
    `<text x="${lx2 + 16}" y="${ly2 + 2}" font-size="11" fill="#333">${label}</text>`,
  ].join("");
}).join("");

const noBarDataMsg = !hasJobData
  ? `<text x="${W / 2}" y="${H / 2}" font-size="13" text-anchor="middle" fill="#999">Per-job timing available after the next CI run.</text>`
  : "";

// X axis labels for bar chart — uses band-scale xPos2 so labels stay centred under bars
function xLabels2() {
  return history
    .map((e, i) => {
      const x = xPos2(i).toFixed(1);
      const y = (mt + ph + 13).toFixed(1);
      return `<text x="${x}" y="${y}" font-size="10" text-anchor="end" fill="#666" transform="rotate(-45,${x},${y})">${e.shortSha} ${e.ts.slice(5, 10)}</text>`;
    })
    .join("");
}

const svg2 = [
  `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" font-family="ui-monospace,monospace">`,
  legend2,
  `<line x1="${ml}" y1="${mt}" x2="${ml}" y2="${mt + ph}" stroke="#ccc" stroke-width="1"/>`,
  `<line x1="${ml}" y1="${mt + ph}" x2="${ml + pw}" y2="${mt + ph}" stroke="#ccc" stroke-width="1"/>`,
  `<text x="${ml - 42}" y="${mt + ph / 2}" font-size="11" fill="#666" transform="rotate(-90,${ml - 42},${mt + ph / 2})" text-anchor="middle">Duration</text>`,
  n > 0 && hasJobData ? barLeftAxis() : "",
  n > 0 && hasJobData ? stackedBars() : "",
  n > 0 ? xLabels2() : "",
  noBarDataMsg,
  "</svg>",
].join("\n");

// ── Summary table ──────────────────────────────────────────────────────────────

const tableRows = [...history]
  .reverse()
  .map((e) => {
    let buildTime =
      e.build_s != null && e.build_s > 0 ? fmtTime(e.build_s) : "\u2014";
    if (e.build_spike === true) buildTime += " \u26a0\ufe0f";
    const installCell =
      e.install_s != null && e.install_s > 0 ? fmtTime(e.install_s) : "\u2014";
    const lintCell =
      e.lint_s != null && e.lint_s > 0 ? fmtTime(e.lint_s) : "\u2014";
    const tcCell = e.tc_s != null && e.tc_s > 0 ? fmtTime(e.tc_s) : "\u2014";
    const fmtCell =
      e.format_s != null && e.format_s > 0 ? fmtTime(e.format_s) : "\u2014";
    const buildJobCell =
      e.build_job_s != null && e.build_job_s > 0
        ? fmtTime(e.build_job_s)
        : "\u2014";
    return [
      "<tr>",
      `<td><code>${e.shortSha}</code></td>`,
      `<td>${e.ts.slice(0, 10)}</td>`,
      `<td>${e.lint != null ? e.lint : "\u2014"}</td>`,
      `<td>${e.tc != null ? e.tc : "\u2014"}</td>`,
      `<td>${e.format != null ? e.format : 0}</td>`,
      `<td>${buildTime}</td>`,
      `<td>${installCell}</td>`,
      `<td>${lintCell}</td>`,
      `<td>${tcCell}</td>`,
      `<td>${fmtCell}</td>`,
      `<td>${buildJobCell}</td>`,
      "</tr>",
    ].join("");
  })
  .join("\n");

const noRowsMsg =
  '<tr><td colspan="11" style="color:#999;text-align:center;padding:20px">No runs recorded yet.</td></tr>';

// ---------------------------------------------------------------------------
// Per-branch build time sparkline section
// ---------------------------------------------------------------------------

const SPARK_W = 120;
const SPARK_H = 28;
const SPARK_PAD = 4;
const SPARK_COLOR = "#27ae60";
const SPARK_RUNS = 5; // number of recent runs to show per branch

/**
 * Generate a mini SVG sparkline for an array of build_s values (nulls excluded).
 * Returns an inline SVG string.
 */
function buildSparkline(vals) {
  const points = vals.filter((v) => v != null && v > 0).slice(-SPARK_RUNS);

  if (points.length < 2) {
    const label =
      points.length === 1
        ? `<text x="${SPARK_W / 2}" y="${SPARK_H / 2 + 4}" font-size="9" text-anchor="middle" fill="#999">${fmtTime(points[0])}</text>`
        : `<text x="${SPARK_W / 2}" y="${SPARK_H / 2 + 4}" font-size="9" text-anchor="middle" fill="#bbb">no data</text>`;
    return `<svg viewBox="0 0 ${SPARK_W} ${SPARK_H}" width="${SPARK_W}" height="${SPARK_H}" xmlns="http://www.w3.org/2000/svg">${label}</svg>`;
  }

  const minV = Math.min(...points);
  const maxV = Math.max(...points);
  const range = maxV - minV || 1;
  const innerW = SPARK_W - SPARK_PAD * 2;
  const innerH = SPARK_H - SPARK_PAD * 2;

  function sx(i) {
    return (
      SPARK_PAD +
      (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW)
    );
  }
  function sy(v) {
    return SPARK_PAD + innerH - ((v - minV) / range) * innerH;
  }

  const coords = points.map(
    (v, i) => `${sx(i).toFixed(1)},${sy(v).toFixed(1)}`,
  );
  const polyPts = coords.join(" ");

  // Closed area fill path: line + close down to baseline
  const baseY = SPARK_PAD + innerH;
  const fillPts = [
    `${sx(0).toFixed(1)},${baseY}`,
    ...coords,
    `${sx(points.length - 1).toFixed(1)},${baseY}`,
  ].join(" ");

  // Tooltip title for last point
  const lastTip = fmtTime(points[points.length - 1]);

  return [
    `<svg viewBox="0 0 ${SPARK_W} ${SPARK_H}" width="${SPARK_W}" height="${SPARK_H}" xmlns="http://www.w3.org/2000/svg">`,
    `<polygon points="${fillPts}" fill="${SPARK_COLOR}" fill-opacity="0.12"/>`,
    `<polyline points="${polyPts}" fill="none" stroke="${SPARK_COLOR}" stroke-width="1.8" stroke-linejoin="round"/>`,
    // Endpoint dot with tooltip
    `<circle cx="${sx(points.length - 1).toFixed(1)}" cy="${sy(points[points.length - 1]).toFixed(1)}" r="2.5" fill="${SPARK_COLOR}"><title>${lastTip}</title></circle>`,
    `</svg>`,
  ].join("");
}

/**
 * Compute the rolling average of the last N non-null positive values.
 */
function rollingAvg(vals, windowSize) {
  const pts = vals.filter((v) => v != null && v > 0).slice(-windowSize);
  if (pts.length === 0) return null;
  return Math.round(pts.reduce((a, b) => a + b, 0) / pts.length);
}

function buildBranchSection() {
  const branchNames = Object.keys(allBranches);
  if (branchNames.length === 0) return "";

  // Sort branches: current branch first, then alphabetically
  branchNames.sort((a, b) => {
    if (a === branch) return -1;
    if (b === branch) return 1;
    return a.localeCompare(b);
  });

  const rows = branchNames
    .map((br) => {
      const entries = allBranches[br];
      if (!Array.isArray(entries) || entries.length === 0) return null;

      const buildSeries = entries.map((e) =>
        e.build_s != null && e.build_s > 0 ? e.build_s : null,
      );

      const lastEntry = entries[entries.length - 1];
      const lastBuild =
        lastEntry.build_s != null && lastEntry.build_s > 0
          ? fmtTime(lastEntry.build_s) +
            (lastEntry.build_spike ? " \u26a0\ufe0f" : "")
          : "\u2014";

      const avg = rollingAvg(buildSeries, SPARK_RUNS);
      const avgFmt = avg != null ? fmtTime(avg) : "\u2014";

      const isCurrent = br === branch;
      const branchCode = isCurrent
        ? `<code style="background:#ddf4dd;color:#1a7f37">${escHtml(br)}</code>`
        : `<code>${escHtml(br)}</code>`;

      // Per-job breakdown from the most recent entry
      const jobBreakdown = (() => {
        const jobs = [
          { label: "Lint", val: lastEntry.lint_s },
          { label: "Typecheck", val: lastEntry.tc_s },
          { label: "Format", val: lastEntry.format_s },
          { label: "Build", val: lastEntry.build_job_s },
        ];
        const hasAny = jobs.some((j) => j.val != null && j.val > 0);
        if (!hasAny) {
          return `<span style="color:#999;font-size:.78rem">no per-job data</span>`;
        }
        const cells = jobs
          .map(
            (j) =>
              `<span style="margin-right:12px"><span style="color:#888">${j.label}:</span> <strong>${j.val != null && j.val > 0 ? fmtTime(j.val) : "\u2014"}</strong></span>`,
          )
          .join("");
        return `<div style="margin-top:5px;font-size:.78rem;color:#444;white-space:normal">${cells}</div>`;
      })();

      const branchCell = `<details style="cursor:pointer"><summary style="list-style:none;display:inline-flex;align-items:center;gap:6px"><span style="font-size:.7rem;color:#888">&#9654;</span>${branchCode}</summary>${jobBreakdown}</details>`;

      const sparkSvg = buildSparkline(buildSeries);

      return [
        `<tr${isCurrent ? ' style="font-weight:600"' : ""}>`,
        `<td>${branchCell}</td>`,
        `<td>${lastBuild}</td>`,
        `<td>${avgFmt}</td>`,
        `<td style="padding:4px 14px">${sparkSvg}</td>`,
        "</tr>",
      ].join("");
    })
    .filter(Boolean)
    .join("\n");

  if (!rows) return "";

  return `
<h2 style="font-size:1rem;margin:28px 0 10px">&#9201;&#65039; Build time trends by branch</h2>
<table class="branch-table" style="max-width:${W + 40}px">
  <thead><tr>
    <th>Branch</th>
    <th>Last build</th>
    <th>${SPARK_RUNS}-run avg</th>
    <th>Trend (last ${SPARK_RUNS} runs)</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>`;
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const branchSection = buildBranchSection();

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>CI Dashboard \u2014 ${branch}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:system-ui,sans-serif;margin:0;padding:28px 32px;background:#f6f8fa;color:#1a1a1a}
  h1{font-size:1.35rem;margin:0 0 4px}
  h2{font-size:1.05rem;margin:24px 0 10px;color:#444}
  .meta{font-size:.82rem;color:#666;margin-bottom:24px}
  .meta a{color:#0969da;text-decoration:none}
  .meta a:hover{text-decoration:underline}
  .card{background:#fff;border:1px solid #d0d7de;border-radius:8px;padding:20px 20px 12px;display:inline-block;margin-bottom:24px;max-width:100%;overflow-x:auto}
  table{border-collapse:collapse;background:#fff;border:1px solid #d0d7de;border-radius:8px;overflow:hidden;width:100%;max-width:${W + 40}px}
  th{background:#f6f8fa;text-align:left;padding:8px 14px;font-size:.82rem;color:#444;border-bottom:1px solid #d0d7de;white-space:nowrap}
  td{padding:7px 14px;font-size:.82rem;border-top:1px solid #f0f0f0;white-space:nowrap}
  tr:hover td{background:#f6f8fa}
  code{font-family:ui-monospace,monospace;background:#f0f0f0;padding:1px 5px;border-radius:3px;font-size:.85em}
  .section-label{font-size:.75rem;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px}
  .branch-table td{vertical-align:middle}
  .branch-table details summary::-webkit-details-marker{display:none}
  .branch-table details summary::marker{display:none}
  .branch-table details[open] summary span:first-child{transform:rotate(90deg);display:inline-block}
</style>
</head>
<body>
<h1>CI Dashboard \u2014 ${branch}</h1>
<p class="meta">Generated ${generatedAt} &middot; ${n} run${n !== 1 ? "s" : ""} in history &middot; <a href="${runUrl}">View workflow run &rarr;</a></p>

<h2>Warnings &amp; total build time</h2>
<div class="card">${svg1}</div>

<h2>Per-job timing breakdown</h2>
<p class="section-label">Stacked bars show install + lint + typecheck + format + build durations per run. Hover a segment for exact time.</p>
<div class="card">${svg2}</div>

<h2>Run history</h2>
<table>
  <thead><tr>
    <th>SHA</th><th>Date</th>
    <th>Lint &#x26a0;&#xfe0f;</th><th>TS &#x26a0;&#xfe0f;</th>
    <th>Format errors</th><th>Total time</th>
    <th>Install</th><th>Lint time</th><th>TC time</th><th>Fmt time</th><th>Build time</th>
  </tr></thead>
  <tbody>${tableRows || noRowsMsg}</tbody>
</table>
${branchSection}
</body>
</html>`;

fs.writeFileSync("ci-dashboard.html", html);
console.log(
  `Dashboard written: ${n} entries, branch=${branch}, cross-branch rows=${Object.keys(allBranches).length}`,
);
