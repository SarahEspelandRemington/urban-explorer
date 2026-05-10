"use strict";

const fs = require("fs");

const histPath = "/tmp/warn-history/warn-history.json";
let history = [];
try {
  history = JSON.parse(fs.readFileSync(histPath, "utf8"));
} catch (e) {
  console.error("Could not read warn-history:", e.message);
}

const branch = process.env.BRANCH || "unknown";
const runUrl = process.env.RUN_URL || "#";
const generatedAt = new Date().toUTCString();
const n = history.length;

// Chart dimensions
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

const lintVals = history.map((e) => (e.lint != null ? e.lint : null));
const tcVals = history.map((e) => (e.tc != null ? e.tc : null));
const buildVals = history.map((e) =>
  e.build_s != null && e.build_s > 0 ? e.build_s : null,
);

const maxW = Math.max(
  1,
  ...lintVals.filter((v) => v !== null),
  ...tcVals.filter((v) => v !== null),
);
const maxB = Math.max(1, ...buildVals.filter((v) => v !== null));

function yWarn(v) {
  return mt + ph - (v / maxW) * ph;
}
function yBuild(v) {
  return mt + ph - (v / maxB) * ph;
}

function fmtTime(s) {
  const min = Math.floor(s / 60),
    sec = s % 60;
  return min > 0 ? `${min}m ${sec}s` : `${sec}s`;
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

function circles(vals, yFn, color) {
  return vals
    .map((v, i) => {
      if (v === null) return "";
      const cx = xPos(i).toFixed(1),
        cy = yFn(v).toFixed(1);
      const label = yFn === yBuild ? fmtTime(v) : String(v);
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
const legend = [
  `<rect x="${lx}" y="${ly - 8}" width="12" height="12" rx="2" fill="#e67e22"/>`,
  `<text x="${lx + 16}" y="${ly + 2}" font-size="11" fill="#333">Lint warnings</text>`,
  `<rect x="${lx + 105}" y="${ly - 8}" width="12" height="12" rx="2" fill="#3498db"/>`,
  `<text x="${lx + 121}" y="${ly + 2}" font-size="11" fill="#333">TS warnings</text>`,
  `<line x1="${lx + 210}" y1="${ly - 2}" x2="${lx + 222}" y2="${ly - 2}" stroke="#27ae60" stroke-width="2.2" stroke-dasharray="5,3"/>`,
  `<circle cx="${lx + 216}" cy="${ly - 2}" r="3.5" fill="#27ae60" stroke="white" stroke-width="1"/>`,
  `<text x="${lx + 226}" y="${ly + 2}" font-size="11" fill="#333">Build time (right axis)</text>`,
].join("");

const noDataMsg =
  n === 0
    ? `<text x="${W / 2}" y="${H / 2}" font-size="14" text-anchor="middle" fill="#999">No history yet — need at least one completed run.</text>`
    : "";

const svg = [
  `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" font-family="ui-monospace,monospace">`,
  legend,
  `<line x1="${ml}" y1="${mt}" x2="${ml}" y2="${mt + ph}" stroke="#ccc" stroke-width="1"/>`,
  `<line x1="${ml}" y1="${mt + ph}" x2="${ml + pw}" y2="${mt + ph}" stroke="#ccc" stroke-width="1"/>`,
  `<line x1="${ml + pw}" y1="${mt}" x2="${ml + pw}" y2="${mt + ph}" stroke="#ddd" stroke-width="1" stroke-dasharray="4,3"/>`,
  `<text x="${ml - 42}" y="${mt + ph / 2}" font-size="11" fill="#666" transform="rotate(-90,${ml - 42},${mt + ph / 2})" text-anchor="middle">Warnings</text>`,
  `<text x="${ml + pw + 60}" y="${mt + ph / 2}" font-size="11" fill="#aaa" transform="rotate(90,${ml + pw + 60},${mt + ph / 2})" text-anchor="middle">Build time</text>`,
  n > 0 ? leftAxis() : "",
  n > 0 ? rightAxis() : "",
  polylines(lintVals, yWarn, "#e67e22"),
  polylines(tcVals, yWarn, "#3498db"),
  polylines(buildVals, yBuild, "#27ae60", "6,3"),
  circles(lintVals, yWarn, "#e67e22"),
  circles(tcVals, yWarn, "#3498db"),
  circles(buildVals, yBuild, "#27ae60"),
  n > 0 ? xLabels() : "",
  noDataMsg,
  "</svg>",
].join("\n");

// History table (newest first)
const tableRows = [...history]
  .reverse()
  .map((e) => {
    const buildTime =
      e.build_s != null && e.build_s > 0 ? fmtTime(e.build_s) : "\u2014";
    return [
      "<tr>",
      `<td><code>${e.shortSha}</code></td>`,
      `<td>${e.ts.slice(0, 10)}</td>`,
      `<td>${e.lint != null ? e.lint : "\u2014"}</td>`,
      `<td>${e.tc != null ? e.tc : "\u2014"}</td>`,
      `<td>${e.format != null ? e.format : 0}</td>`,
      `<td>${buildTime}</td>`,
      "</tr>",
    ].join("");
  })
  .join("\n");

const noRowsMsg =
  '<tr><td colspan="6" style="color:#999;text-align:center;padding:20px">No runs recorded yet.</td></tr>';

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>CI Dashboard \u2014 ${branch}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:system-ui,sans-serif;margin:0;padding:28px 32px;background:#f6f8fa;color:#1a1a1a}
  h1{font-size:1.35rem;margin:0 0 4px}
  .meta{font-size:.82rem;color:#666;margin-bottom:24px}
  .meta a{color:#0969da;text-decoration:none}
  .meta a:hover{text-decoration:underline}
  .card{background:#fff;border:1px solid #d0d7de;border-radius:8px;padding:20px 20px 12px;display:inline-block;margin-bottom:24px;max-width:100%;overflow-x:auto}
  table{border-collapse:collapse;background:#fff;border:1px solid #d0d7de;border-radius:8px;overflow:hidden;width:100%;max-width:${W + 40}px}
  th{background:#f6f8fa;text-align:left;padding:8px 14px;font-size:.82rem;color:#444;border-bottom:1px solid #d0d7de;white-space:nowrap}
  td{padding:7px 14px;font-size:.82rem;border-top:1px solid #f0f0f0;white-space:nowrap}
  tr:hover td{background:#f6f8fa}
  code{font-family:ui-monospace,monospace;background:#f0f0f0;padding:1px 5px;border-radius:3px;font-size:.85em}
</style>
</head>
<body>
<h1>CI Dashboard \u2014 ${branch}</h1>
<p class="meta">Generated ${generatedAt} &middot; ${n} run${n !== 1 ? "s" : ""} in history &middot; <a href="${runUrl}">View workflow run &rarr;</a></p>
<div class="card">${svg}</div>
<table>
  <thead><tr>
    <th>SHA</th><th>Date</th>
    <th>Lint &#x26a0;&#xfe0f;</th><th>TS &#x26a0;&#xfe0f;</th>
    <th>Format errors</th><th>Build time</th>
  </tr></thead>
  <tbody>${tableRows || noRowsMsg}</tbody>
</table>
</body>
</html>`;

fs.writeFileSync("ci-dashboard.html", html);
console.log(`Dashboard written: ${n} entries, branch=${branch}`);
