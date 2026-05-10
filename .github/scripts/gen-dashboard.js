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
// Normalized shape: { branchName: { entries: [...], stale: bool } }
// Supports both the legacy { branch: [...entries] } format and the current
// { branch: { entries, stale } } format produced by the merge step.
let allBranches = {};
try {
  const raw = JSON.parse(
    fs.readFileSync("/tmp/branch-histories/all-branches.json", "utf8"),
  );
  for (const [br, val] of Object.entries(raw)) {
    if (Array.isArray(val)) {
      allBranches[br] = { entries: val, stale: false };
    } else if (val && Array.isArray(val.entries)) {
      allBranches[br] = { entries: val.entries, stale: !!val.stale };
    }
  }
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

// ── Chart 3: Top warning files table ─────────────────────────────────────────
// Collect the union of all files that appear in any run's topFiles list,
// then render a table with runs as columns and files as rows.

// Runs shown in table (up to last 10, oldest → newest for left-to-right reading)
const fileTableRuns = history.slice(-10);
const fileTableN = fileTableRuns.length;

// Build a map: file → array of warning counts indexed by run position within fileTableRuns.
// Also track each file's peak total for sorting.
const fileMap = new Map(); // file → { lintByRun, tcByRun, totalByRun, peakTotal }

for (let ri = 0; ri < fileTableN; ri++) {
  const entry = fileTableRuns[ri];
  const topFiles = Array.isArray(entry.topFiles) ? entry.topFiles : [];
  for (const tf of topFiles) {
    if (!tf.file) continue;
    if (!fileMap.has(tf.file)) {
      fileMap.set(tf.file, {
        lintByRun: new Array(fileTableN).fill(null),
        tcByRun: new Array(fileTableN).fill(null),
        totalByRun: new Array(fileTableN).fill(null),
        peakTotal: 0,
      });
    }
    const rec = fileMap.get(tf.file);
    const lw = tf.lint_warnings != null ? tf.lint_warnings : 0;
    const tw = tf.tc_warnings != null ? tf.tc_warnings : 0;
    const total = tf.warnings != null ? tf.warnings : lw + tw;
    rec.lintByRun[ri] = lw;
    rec.tcByRun[ri] = tw;
    rec.totalByRun[ri] = total;
    if (total > rec.peakTotal) rec.peakTotal = total;
  }
}

// Sort files by warning count in the most recent run (desc), then by peak total (desc).
const latestRunIdx = fileTableN - 1;
const sortedFiles = [...fileMap.entries()].sort((a, b) => {
  const aLast = a[1].totalByRun[latestRunIdx] ?? 0;
  const bLast = b[1].totalByRun[latestRunIdx] ?? 0;
  if (bLast !== aLast) return bLast - aLast;
  return b[1].peakTotal - a[1].peakTotal;
});

// ── Chronic file hotspot detection ───────────────────────────────────────────
// A file is a chronic offender when it ranks in the top HOTSPOT_RANK (by
// warnings) for each of the last HOTSPOT_RUNS consecutive runs shown in the
// table. Mirrors the thresholds used by the CI hotspot-gate step.
const HOTSPOT_RUNS = 5;
const HOTSPOT_RANK = 3;

function computeChronicFiles(tableRuns, rankThreshold, runsThreshold) {
  if (tableRuns.length < runsThreshold) return new Set();
  const recentRuns = tableRuns.slice(-runsThreshold);
  // For each run build the sorted top-rankThreshold file name list.
  const topSets = recentRuns.map((e) => {
    const files = Array.isArray(e.topFiles) ? e.topFiles : [];
    return files
      .slice()
      .sort((a, b) => (b.warnings ?? 0) - (a.warnings ?? 0))
      .slice(0, rankThreshold)
      .map((f) => f.file)
      .filter(Boolean);
  });
  if (topSets.length === 0 || topSets[0].length === 0) return new Set();
  // Intersect: start with first run's set, keep only files present in every
  // subsequent run's set.
  const candidates = new Set(topSets[0]);
  for (let i = 1; i < topSets.length; i++) {
    const runSet = new Set(topSets[i]);
    for (const f of candidates) {
      if (!runSet.has(f)) candidates.delete(f);
    }
  }
  return candidates;
}

const chronicFiles = computeChronicFiles(
  fileTableRuns,
  HOTSPOT_RANK,
  HOTSPOT_RUNS,
);

// Strip common path prefix (repo root) from file names for display.
function stripCommonPrefix(files) {
  if (files.length === 0) return {};
  const parts = files.map((f) => f.split("/"));
  let prefixLen = 0;
  outer: while (true) {
    const seg = parts[0][prefixLen];
    if (seg === undefined) break;
    for (const p of parts) {
      if (p[prefixLen] !== seg) break outer;
    }
    prefixLen++;
  }
  const map = {};
  for (let i = 0; i < files.length; i++) {
    map[files[i]] = parts[i].slice(prefixLen).join("/") || files[i];
  }
  return map;
}

const allFileNames = sortedFiles.map(([f]) => f);
const displayNames = stripCommonPrefix(allFileNames);

// Render the files table as HTML (not SVG — a table is cleaner for per-file data).
function renderFileTable() {
  if (fileTableN === 0 || sortedFiles.length === 0) {
    return `<p style="color:#999;font-size:.85rem">No per-file warning data yet — needs at least one CI run with lint or typecheck warnings.</p>`;
  }

  // Column headers: short SHA + date
  const headCols = fileTableRuns
    .map((e) => {
      const date = e.ts ? e.ts.slice(5, 10) : "";
      return `<th title="${e.sha || ""}">${e.shortSha || ""}<br><span style="font-weight:400;color:#888">${date}</span></th>`;
    })
    .join("");

  // Colour-scale a cell: white (0) → amber (high)
  function cellBg(val, peak) {
    if (val === null || val === 0 || peak === 0) return "";
    const t = Math.min(val / peak, 1);
    // amber tint: rgb(255, 215-t*80, 180-t*130)
    const g = Math.round(215 - t * 80);
    const b = Math.round(180 - t * 130);
    return `background:rgb(255,${g},${b})`;
  }

  const globalPeak = Math.max(1, ...sortedFiles.map(([, r]) => r.peakTotal));

  const rows = sortedFiles
    .map(([file, rec]) => {
      const cells = rec.totalByRun
        .map((v) => {
          if (v === null)
            return `<td style="color:#ccc;text-align:center">—</td>`;
          const bg = cellBg(v, globalPeak);
          return `<td style="text-align:center;${bg ? bg + ";" : ""}">${v}</td>`;
        })
        .join("");
      const label = escHtml(displayNames[file] || file);
      const hotspotBadge = chronicFiles.has(file)
        ? ` <span title="Chronic hotspot: ranked in the top ${HOTSPOT_RANK} for warnings across ${HOTSPOT_RUNS} consecutive runs" style="font-size:.8rem">🔥</span>`
        : "";
      return `<tr><td style="font-family:ui-monospace,monospace;font-size:.78rem;white-space:nowrap;max-width:380px;overflow:hidden;text-overflow:ellipsis" title="${escHtml(file)}"><code>${label}</code>${hotspotBadge}</td>${cells}</tr>`;
    })
    .join("\n");

  const hotspotLegend =
    chronicFiles.size > 0
      ? `<p style="font-size:.78rem;color:#666;margin:6px 0 0">🔥 = chronic hotspot: ranked in the top ${HOTSPOT_RANK} for warnings across the last ${HOTSPOT_RUNS} consecutive runs.</p>`
      : "";

  return `<table style="border-collapse:collapse;background:#fff;border:1px solid #d0d7de;border-radius:8px;overflow:hidden;font-size:.82rem">
  <thead><tr>
    <th style="background:#f6f8fa;text-align:left;padding:8px 14px;font-size:.82rem;color:#444;border-bottom:1px solid #d0d7de;white-space:nowrap">File</th>
    ${headCols.replace(/<th/g, '<th style="background:#f6f8fa;text-align:center;padding:8px 10px;font-size:.8rem;color:#444;border-bottom:1px solid #d0d7de;min-width:58px"')}
  </tr></thead>
  <tbody>${rows}</tbody>
</table>${hotspotLegend}`;
}

const fileTableHtml = renderFileTable();

// ── Summary table ──────────────────────────────────────────────────────────────

// Per-column historical maxima used to colour-scale the per-job timing cells.
const JOB_TIME_KEYS = ["install_s", "lint_s", "tc_s", "format_s", "build_job_s"];
const colMaxes = {};
for (const key of JOB_TIME_KEYS) {
  const vals = history
    .map((e) => (e[key] != null && e[key] > 0 ? e[key] : null))
    .filter((v) => v !== null);
  colMaxes[key] = vals.length > 0 ? Math.max(...vals) : 0;
}

/**
 * Return an inline CSS background value (green → yellow → orange) for a
 * per-job timing cell.  t=0 → fastest (light green), t=1 → slowest/max
 * (light orange).  Returns an empty string when the cell has no data so
 * the <td> style attribute becomes a harmless style="".
 * @param {number|null} val - raw seconds for this run
 * @param {number} colMax - historical max seconds for this column
 */
function jobTimingBg(val, colMax) {
  if (val == null || val <= 0 || colMax <= 0) return "";
  const t = Math.min(val / colMax, 1);
  let r, g, b;
  if (t <= 0.5) {
    // light green rgb(200,237,200) → light yellow rgb(255,244,170)
    const u = t * 2;
    r = Math.round(200 + u * 55);
    g = Math.round(237 + u * 7);
    b = Math.round(200 - u * 30);
  } else {
    // light yellow rgb(255,244,170) → light orange rgb(255,200,120)
    const u = (t - 0.5) * 2;
    r = 255;
    g = Math.round(244 - u * 44);
    b = Math.round(170 - u * 50);
  }
  return `background:rgb(${r},${g},${b})`;
}

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
      `<td style="${jobTimingBg(e.install_s, colMaxes.install_s)}">${installCell}</td>`,
      `<td style="${jobTimingBg(e.lint_s, colMaxes.lint_s)}">${lintCell}</td>`,
      `<td style="${jobTimingBg(e.tc_s, colMaxes.tc_s)}">${tcCell}</td>`,
      `<td style="${jobTimingBg(e.format_s, colMaxes.format_s)}">${fmtCell}</td>`,
      `<td style="${jobTimingBg(e.build_job_s, colMaxes.build_job_s)}">${buildJobCell}</td>`,
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
const TREND_THRESHOLD = 0.1; // >10% delta from rolling avg = meaningful change

/**
 * Generate a mini SVG sparkline for an array of build_s values (nulls excluded).
 * Returns an inline SVG string.
 * @param {(number|null)[]} vals
 * @param {number} [w] - SVG width (defaults to SPARK_W)
 * @param {number} [h] - SVG height (defaults to SPARK_H)
 * @param {string} [color] - Stroke/fill color (defaults to SPARK_COLOR)
 */
function buildSparkline(vals, runUrl, w, h, color) {
  const svgW = w != null ? w : SPARK_W;
  const svgH = h != null ? h : SPARK_H;
  const svgColor = color != null ? color : SPARK_COLOR;
  const points = vals.filter((v) => v != null && v > 0).slice(-SPARK_RUNS);

  if (points.length < 2) {
    const label =
      points.length === 1
        ? `<text x="${svgW / 2}" y="${svgH / 2 + 4}" font-size="9" text-anchor="middle" fill="#999">${fmtTime(points[0])}</text>`
        : `<text x="${svgW / 2}" y="${svgH / 2 + 4}" font-size="9" text-anchor="middle" fill="#bbb">no data</text>`;
    return `<svg viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}" xmlns="http://www.w3.org/2000/svg">${label}</svg>`;
  }

  const minV = Math.min(...points);
  const maxV = Math.max(...points);
  const range = maxV - minV || 1;
  const innerW = svgW - SPARK_PAD * 2;
  const innerH = svgH - SPARK_PAD * 2;

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

  // Tooltip title for last point (include run URL if available)
  const lastTip = runUrl
    ? `${fmtTime(points[points.length - 1])} — ${escHtml(runUrl)}`
    : fmtTime(points[points.length - 1]);

  const endCx = sx(points.length - 1).toFixed(1);
  const endCy = sy(points[points.length - 1]).toFixed(1);
  // Keep the tooltip on the dot for discoverability; the whole SVG is now the link.
  const endDot = `<circle cx="${endCx}" cy="${endCy}" r="2.5" fill="${svgColor}"><title>${lastTip}</title></circle>`;

  const svgStyle = runUrl ? ` style="cursor:pointer"` : "";
  const svgInner = [
    `<svg viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}" xmlns="http://www.w3.org/2000/svg"${svgStyle}>`,
    `<polygon points="${fillPts}" fill="${svgColor}" fill-opacity="0.12"/>`,
    `<polyline points="${polyPts}" fill="none" stroke="${svgColor}" stroke-width="1.8" stroke-linejoin="round"/>`,
    endDot,
    `</svg>`,
  ].join("");

  return runUrl
    ? `<a href="${escHtml(runUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;line-height:0">${svgInner}</a>`
    : svgInner;
}

/**
 * Compute the rolling average of the last N non-null positive values.
 */
function rollingAvg(vals, windowSize) {
  const pts = vals.filter((v) => v != null && v > 0).slice(-windowSize);
  if (pts.length === 0) return null;
  return Math.round(pts.reduce((a, b) => a + b, 0) / pts.length);
}

/**
 * Return a trend arrow span comparing lastVal to avgVal.
 * ↑ red   = last is more than TREND_THRESHOLD above avg (getting slower)
 * ↓ green = last is more than TREND_THRESHOLD below avg (getting faster)
 * → gray  = within threshold (flat)
 * Returns "" when data is insufficient.
 * @param {number|null} lastVal
 * @param {number|null} avgVal
 * @param {number} threshold  fractional threshold (e.g. 0.1 = 10%)
 */
function trendArrow(lastVal, avgVal, threshold) {
  if (lastVal == null || avgVal == null || avgVal === 0) return "";
  const delta = (lastVal - avgVal) / avgVal;
  const pct = Math.round(Math.abs(delta) * 100);
  if (delta > threshold) {
    return `<span style="color:#e74c3c;font-size:.8rem;font-weight:700;line-height:1" title="\u2191 ${pct}% above ${SPARK_RUNS}-run avg (slower)">\u2191</span>`;
  } else if (delta < -threshold) {
    return `<span style="color:#27ae60;font-size:.8rem;font-weight:700;line-height:1" title="\u2193 ${pct}% below ${SPARK_RUNS}-run avg (faster)">\u2193</span>`;
  } else {
    return `<span style="color:#aaa;font-size:.8rem;line-height:1" title="\u2192 within ${Math.round(threshold * 100)}% of ${SPARK_RUNS}-run avg (flat)">\u2192</span>`;
  }
}

function buildBranchSection() {
  const branchNames = Object.keys(allBranches);
  if (branchNames.length === 0) return "";

  // Sort branches: current branch first, then live branches alphabetically,
  // then stale (merged/deleted) branches alphabetically.
  branchNames.sort((a, b) => {
    if (a === branch) return -1;
    if (b === branch) return 1;
    const aStale = allBranches[a].stale;
    const bStale = allBranches[b].stale;
    if (aStale !== bStale) return aStale ? 1 : -1;
    return a.localeCompare(b);
  });

  const rows = branchNames
    .map((br) => {
      const branchData = allBranches[br];
      // Support legacy array format and enriched { entries, runUrl, stale } format.
      const entries = Array.isArray(branchData)
        ? branchData
        : branchData && Array.isArray(branchData.entries)
          ? branchData.entries
          : null;
      const runUrl =
        !Array.isArray(branchData) && branchData && branchData.runUrl
          ? branchData.runUrl
          : null;
      const stale =
        !Array.isArray(branchData) && branchData ? !!branchData.stale : false;

      if (!entries || entries.length === 0) return null;

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
      const staleBadge = stale
        ? ` <span style="font-size:.68rem;color:#6e7781;background:#f0f0f0;border:1px solid #d0d7de;border-radius:3px;padding:1px 5px;vertical-align:middle;font-family:system-ui,sans-serif">merged</span>`
        : "";
      const branchLabel = isCurrent
        ? `<code style="background:#ddf4dd;color:#1a7f37">${escHtml(br)}</code>${staleBadge}`
        : `<code style="${stale ? "text-decoration:line-through;color:#8a8a8a" : ""}">${escHtml(br)}</code>${staleBadge}`;
      const branchLinked = runUrl
        ? `<a href="${escHtml(runUrl)}" target="_blank" rel="noopener noreferrer" style="text-decoration:none">${branchLabel}</a>`
        : branchLabel;

      // Per-job breakdown: sparkline trend across recent runs + last value
      const JOB_SPARK_W = 80;
      const JOB_SPARK_H = 24;
      const JOB_SPARK_COLORS = {
        lint_s: "#e67e22",
        tc_s: "#3498db",
        format_s: "#2ecc71",
        build_job_s: "#e74c3c",
      };
      const jobBreakdown = (() => {
        const jobs = [
          { label: "Lint", key: "lint_s" },
          { label: "Typecheck", key: "tc_s" },
          { label: "Format", key: "format_s" },
          { label: "Build", key: "build_job_s" },
        ];
        const hasAny = jobs.some(
          (j) => lastEntry[j.key] != null && lastEntry[j.key] > 0,
        );
        if (!hasAny) {
          return `<span style="color:#999;font-size:.78rem">no per-job data</span>`;
        }
        const validJobs = jobs.filter(
          (j) => lastEntry[j.key] != null && lastEntry[j.key] > 0,
        );
        const total = validJobs.reduce((sum, j) => sum + lastEntry[j.key], 0);
        const maxVal = validJobs.reduce(
          (best, j) => (lastEntry[j.key] > best ? lastEntry[j.key] : best),
          0,
        );
        const slowestLabel =
          total > 0 && maxVal / total > 0.5
            ? validJobs.find((j) => lastEntry[j.key] === maxVal)?.label
            : null;
        const cells = jobs
          .map((j) => {
            const series = entries.map((e) =>
              e[j.key] != null && e[j.key] > 0 ? e[j.key] : null,
            );
            const lastVal = lastEntry[j.key];
            const lastFmt =
              lastVal != null && lastVal > 0 ? fmtTime(lastVal) : "\u2014";
            const spark = buildSparkline(
              series,
              null,
              JOB_SPARK_W,
              JOB_SPARK_H,
              JOB_SPARK_COLORS[j.key],
            );
            const isSlowest = slowestLabel != null && j.label === slowestLabel;
            const labelColor = isSlowest ? "#e67e22" : "#888";
            const labelWeight = isSlowest ? "600" : "normal";
            const valueColor = isSlowest ? ";color:#e67e22" : "";
            const jobAvg = rollingAvg(series, SPARK_RUNS);
            const arrow =
              lastVal != null && lastVal > 0
                ? trendArrow(lastVal, jobAvg, TREND_THRESHOLD)
                : "";
            return (
              `<div style="display:inline-flex;align-items:center;gap:5px;margin-right:14px;margin-bottom:3px">` +
              `<span style="color:${labelColor};font-weight:${labelWeight};font-size:.75rem;min-width:60px">${j.label}${isSlowest ? " \u26a0\ufe0f" : ""}</span>` +
              spark +
              `<strong style="font-size:.75rem;min-width:32px;text-align:right${valueColor}">${lastFmt}</strong>` +
              arrow +
              `</div>`
            );
          })
          .join("");
        return `<div style="margin-top:6px;white-space:normal;display:flex;flex-wrap:wrap;gap:2px 0">${cells}</div>`;
      })();

      const branchCell = `<details style="cursor:pointer"><summary style="list-style:none;display:inline-flex;align-items:center;gap:6px"><span style="font-size:.7rem;color:#888">&#9654;</span>${branchLinked}</summary>${jobBreakdown}</details>`;

      const sparkSvg = buildSparkline(buildSeries, runUrl);

      const lastBuildRaw =
        lastEntry.build_s != null && lastEntry.build_s > 0
          ? lastEntry.build_s
          : -1;
      const avgRaw = avg != null ? avg : -1;

      return [
        `<tr${isCurrent ? ' class="branch-current"' : ""} data-branch="${escHtml(br)}" data-last="${lastBuildRaw}" data-avg="${avgRaw}">`,
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

  const sortScript = `
<script>
(function(){
  var SK = 'branch-table-sort';
  var table = document.getElementById('branch-sort-table');
  if(!table) return;
  var tbody = table.querySelector('tbody');
  var headers = table.querySelectorAll('th[data-col]');
  var state = {col:null, dir:1};
  try{ var s=sessionStorage.getItem(SK); if(s){ state=JSON.parse(s); } }catch(e){}

  function colVal(tr, col){
    if(col==='branch') return (tr.getAttribute('data-branch')||'').toLowerCase();
    if(col==='last') return parseFloat(tr.getAttribute('data-last')||'-1');
    if(col==='avg' || col==='trend') return parseFloat(tr.getAttribute('data-avg')||'-1');
    return '';
  }

  function applySort(){
    headers.forEach(function(th){
      var ind = th.querySelector('.sort-ind');
      if(!ind) return;
      if(th.getAttribute('data-col')===state.col){
        ind.textContent = state.dir===1 ? ' \u25b2' : ' \u25bc';
      } else {
        ind.textContent = '';
      }
    });
    if(!state.col) return;
    var rows = Array.prototype.slice.call(tbody.querySelectorAll('tr'));
    rows.sort(function(a,b){
      var av = colVal(a, state.col);
      var bv = colVal(b, state.col);
      if(typeof av==='string') return state.dir * av.localeCompare(bv);
      // Push missing values (-1) to the bottom regardless of sort direction
      if(av===-1 && bv===-1) return 0;
      if(av===-1) return 1;
      if(bv===-1) return -1;
      return state.dir * (av - bv);
    });
    rows.forEach(function(r){ tbody.appendChild(r); });
  }

  headers.forEach(function(th){
    th.style.cursor='pointer';
    th.style.userSelect='none';
    th.addEventListener('click', function(){
      var col = th.getAttribute('data-col');
      if(state.col===col){ state.dir = state.dir===1 ? -1 : 1; }
      else { state.col=col; state.dir=1; }
      try{ sessionStorage.setItem(SK, JSON.stringify(state)); }catch(e){}
      applySort();
    });
  });

  applySort();
})();
</script>`;

  return `
<h2 style="font-size:1rem;margin:28px 0 10px">&#9201;&#65039; Build time trends by branch</h2>
<table id="branch-sort-table" class="branch-table" style="max-width:${W + 40}px">
  <thead><tr>
    <th data-col="branch">Branch<span class="sort-ind"></span></th>
    <th data-col="last">Last build<span class="sort-ind"></span></th>
    <th data-col="avg">${SPARK_RUNS}-run avg<span class="sort-ind"></span></th>
    <th data-col="trend">Trend (last ${SPARK_RUNS} runs)<span class="sort-ind"></span></th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>
${sortScript}`;
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
  .branch-table tr.branch-current{font-weight:600}
  .branch-table th[data-col]:hover{background:#eaecf0;color:#1a1a1a}
  .branch-table th[data-col] .sort-ind{color:#0969da;font-size:.75rem}
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

<h2>Top warning files</h2>
<p class="section-label">Files with the most warnings across recent runs (lint + typecheck combined). Cells are colour-coded by intensity — darker amber = higher count. Only files that appeared in the top-10 of at least one run are shown.</p>
<div style="overflow-x:auto;margin-bottom:24px">${fileTableHtml}</div>

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
