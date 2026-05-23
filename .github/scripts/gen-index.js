"use strict";

const fs = require("fs");

const manifestPath = process.argv[2];
const outputPath = process.argv[3];

if (!manifestPath || !outputPath) {
  console.error("Usage: gen-index.js <manifest.json> <output-index.html>");
  process.exit(1);
}

let runs = [];
try {
  runs = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
} catch (e) {
  console.error("Could not read manifest:", e.message);
}

const generatedAt = new Date().toUTCString();
const n = runs.length;

const tableRows = runs
  .map((r) => {
    const archiveHref = `runs/${r.slug}.html`;
    const runLink = r.runUrl
      ? `<a href="${escHtml(r.runUrl)}" rel="noopener noreferrer">Actions run ↗</a>`
      : "—";
    return [
      "<tr>",
      `<td><code>${escHtml(r.slug)}</code></td>`,
      `<td>${escHtml(r.date)}</td>`,
      `<td><code>${escHtml(r.sha)}</code></td>`,
      `<td><a href="${escHtml(archiveHref)}">Dashboard</a></td>`,
      `<td>${runLink}</td>`,
      "</tr>",
    ].join("");
  })
  .join("\n");

const noRowsMsg =
  '<tr><td colspan="5" style="color:#999;text-align:center;padding:20px">No archived runs yet.</td></tr>';

function escHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>CI Dashboard Archive</title>
<style>
  *{box-sizing:border-box}
  body{font-family:system-ui,sans-serif;margin:0;padding:28px 32px;background:#f6f8fa;color:#1a1a1a;max-width:860px}
  h1{font-size:1.35rem;margin:0 0 4px}
  .meta{font-size:.82rem;color:#666;margin-bottom:24px}
  .meta a{color:#0969da;text-decoration:none}
  .meta a:hover{text-decoration:underline}
  .latest{margin-bottom:24px;padding:14px 18px;background:#fff;border:1px solid #d0d7de;border-radius:8px;font-size:.88rem}
  .latest a{color:#0969da;font-weight:600;text-decoration:none}
  .latest a:hover{text-decoration:underline}
  table{border-collapse:collapse;background:#fff;border:1px solid #d0d7de;border-radius:8px;overflow:hidden;width:100%}
  th{background:#f6f8fa;text-align:left;padding:8px 14px;font-size:.82rem;color:#444;border-bottom:1px solid #d0d7de;white-space:nowrap}
  td{padding:7px 14px;font-size:.82rem;border-top:1px solid #f0f0f0;white-space:nowrap}
  tr:hover td{background:#f6f8fa}
  code{font-family:ui-monospace,monospace;background:#f0f0f0;padding:1px 5px;border-radius:3px;font-size:.85em}
  a{color:#0969da;text-decoration:none}
  a:hover{text-decoration:underline}
</style>
</head>
<body>
<h1>CI Dashboard Archive</h1>
<p class="meta">Generated ${generatedAt} &middot; ${n} archived run${n !== 1 ? "s" : ""} (newest first, capped at 30)</p>
<div class="latest">
  <strong>Latest dashboard:</strong> <a href="ci-dashboard.html">ci-dashboard.html</a>
</div>
<table>
  <thead><tr>
    <th>Run slug</th>
    <th>Date</th>
    <th>SHA</th>
    <th>Archive</th>
    <th>Workflow run</th>
  </tr></thead>
  <tbody>${tableRows || noRowsMsg}</tbody>
</table>
</body>
</html>`;

fs.writeFileSync(outputPath, html);
console.log(`Index written: ${n} entries → ${outputPath}`);
