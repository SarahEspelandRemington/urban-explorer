/**
 * Automated PAB record interpreter. Offline/non-production, experimental —
 * see ../README.md.
 *
 * Takes retrieval records from pabAdapter.ts and fetches+classifies each
 * one's PAB detail page (Overview) plus its Chronology sub-page — the same
 * already-enumerated PAB record's own pages, not a new source — WITHOUT any
 * human-in-the-loop decision. Human review is not a required gate here;
 * classification is a deterministic function of detectable evidence signals
 * in the record's own page text.
 *
 * A record is "claim-bearing" when it exposes at least one of:
 *  - a named citation to an independently published/dated source (author +
 *    year, e.g. a 19th/20th-century guidebook or biographical work);
 *  - a named archival collection (e.g. an architectural-drawing collection);
 *  - a dated, named-architect record (a drawing/plan set with an architect
 *    name and an explicit date);
 *  - an explicit register-status date (e.g. a Philadelphia Register listing
 *    date);
 *  - a Project Chronology entry (a dated, PAB-curated construction/
 *    alteration/demolition/fire/etc. event, optionally with an
 *    architect/contractor name);
 *  - an "Also known as:" alternate/former name;
 *  - a Client: value that names something distinct from the record's own
 *    title (not merely the title restated).
 * "lead-only" covers records with real Overview content (a Building Type
 * and/or Client field) but none of the above signals — bare register
 * metadata, per the task's "do not manufacture stories from register
 * metadata alone" instruction. "no-usable-evidence" covers records with
 * neither.
 */
import type { PabRetrievalRecord } from "./pabAdapter";

export type PabRecordClassification =
  | "claim-bearing"
  | "lead-only"
  | "no-usable-evidence";

/** One Project Chronology entry — PAB's own curated dated-event record for this project (BUILT, ADDITIONS/ALTERATIONS, DEMOLISHED, BURNED, REBUILT, etc.), with any named architect(s)/contractor(s) attached to that specific event. */
export interface PabChronologyEvent {
  dateRaw: string;
  eventRaw: string;
  architects: string[];
  contractors: string[];
}

export interface PabSignals {
  namedCitationWithYear?: string;
  namedCollection?: string;
  datedArchitectRecord?: { architect: string; date: string; raw: string };
  registerDateEntry?: { date: string; raw: string };
  chronologyEvents?: PabChronologyEvent[];
  alsoKnownAs?: string[];
  /** Only set when Client: names something distinct from the record's own title — not when it merely restates the title. */
  client?: string;
}

export interface PabInterpretedRecord {
  pabId: string;
  url: string;
  title: string;
  classification: PabRecordClassification;
  plainText: string;
  signals: PabSignals;
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<(br|\/p|\/div|\/tr|\/li|\/h[1-6])\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#160;/gi, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

const CITATION_RE =
  /[A-Z][a-zA-Z.]{1,30},\s+[A-Z][a-zA-Z]{1,20}\.[\s\S]{0,250}?\b(?:1[5-9]\d{2}|20\d{2})\b[^.]{0,80}\./;
const COLLECTION_RE = /\b[A-Z][a-zA-Z\-\s]{2,60}Collection\b/;
const DATED_ARCHITECT_RE =
  /\(([^,()]+),\s*architects?,\s*(\d{1,2}\/\d{1,2}\/\d{2,4})\)/i;
const REGISTER_DATE_RE =
  /Historic Registrations and Surveys[\s\S]{0,300}?(\d{1,2}\/\d{1,2}\/\d{4})/;
const ALSO_KNOWN_AS_RE = /Also known as:\s*\n?\s*([^\n]+)/;
const CLIENT_RE = /Client:\s*\n?\s*([^\n]+)/;

/** PAB's own Project Chronology sub-page (pj_display_alldates.cfm) for the same record. Each event is a `<tr valign="top" bgcolor="...">` row: first `<td>` holds `<big>DATE</big><br><small class="light">EVENT</small>`, second `<td>` holds zero or more `<b>Architect:</b> <a>NAME</a>` / `<b>Contractor:</b> <a>NAME</a>` entries. */
function parseChronologyHtml(html: string): PabChronologyEvent[] {
  const rows = html.split(/(?=<tr valign="top" bgcolor=")/i);
  const events: PabChronologyEvent[] = [];
  for (const rowChunk of rows) {
    const rowEnd = rowChunk.search(/<\/tr>/i);
    const row = rowEnd === -1 ? rowChunk : rowChunk.slice(0, rowEnd);
    const dateEventMatch = row.match(
      /<big>\s*([^<]+?)\s*<\/big>\s*<br>\s*<small class="light">\s*([^<]+?)\s*<\/small>/i,
    );
    if (!dateEventMatch) continue;
    const architects = [
      ...row.matchAll(
        /<b>\s*Architect:\s*<\/b>\s*(?:<a[^>]*>)?\s*([^<]+?)\s*(?:<\/a>)?\s*(?:<br|<\/td)/gi,
      ),
    ].map((m) => m[1].trim());
    const contractors = [
      ...row.matchAll(
        /<b>\s*Contractor:\s*<\/b>\s*(?:<a[^>]*>)?\s*([^<]+?)\s*(?:<\/a>)?\s*(?:<br|<\/td)/gi,
      ),
    ].map((m) => m[1].trim());
    events.push({
      dateRaw: dateEventMatch[1].trim(),
      eventRaw: dateEventMatch[2].trim(),
      architects,
      contractors,
    });
  }
  return events;
}

function detectSignals(text: string, title: string): PabSignals {
  const flat = text.replace(/\s+/g, " ");
  const signals: PabSignals = {};

  const citation = flat.match(CITATION_RE);
  if (citation) signals.namedCitationWithYear = citation[0].trim();

  const collection = flat.match(COLLECTION_RE);
  if (collection) signals.namedCollection = collection[0].trim();

  const architect = flat.match(DATED_ARCHITECT_RE);
  if (architect)
    signals.datedArchitectRecord = {
      architect: architect[1].trim(),
      date: architect[2],
      raw: architect[0].trim(),
    };

  const register = flat.match(REGISTER_DATE_RE);
  if (register)
    signals.registerDateEntry = { date: register[1], raw: register[0].trim() };

  const akaMatch = text.match(ALSO_KNOWN_AS_RE);
  if (akaMatch) {
    const names = akaMatch[1]
      .split(";")
      .map((n) => n.trim())
      .filter(Boolean);
    if (names.length > 0) signals.alsoKnownAs = names;
  }

  const clientMatch = text.match(CLIENT_RE);
  if (clientMatch) {
    const clientValue = clientMatch[1].trim();
    const normalize = (s: string) =>
      s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
    if (clientValue && normalize(clientValue) !== normalize(title))
      signals.client = clientValue;
  }

  return signals;
}

function classify(signals: PabSignals, text: string): PabRecordClassification {
  const hasClaimSignal = !!(
    signals.namedCitationWithYear ||
    signals.namedCollection ||
    signals.datedArchitectRecord ||
    signals.registerDateEntry ||
    (signals.chronologyEvents && signals.chronologyEvents.length > 0) ||
    (signals.alsoKnownAs && signals.alsoKnownAs.length > 0) ||
    signals.client
  );
  if (hasClaimSignal) return "claim-bearing";
  const hasOverviewContent = /Building Type:|Client:/.test(text);
  return hasOverviewContent ? "lead-only" : "no-usable-evidence";
}

/** Same PAB record's Chronology tab (pj_display_alldates.cfm), not a new source. */
function chronologyUrl(overviewUrl: string): string {
  return overviewUrl.replace("pj_display.cfm", "pj_display_alldates.cfm");
}

export async function classifyPabRecord(
  record: PabRetrievalRecord,
): Promise<PabInterpretedRecord> {
  const res = await fetch(record.url);
  const html = await res.text();
  const plainText = htmlToPlainText(html);

  const chronologyRes = await fetch(chronologyUrl(record.url));
  const chronologyHtml = await chronologyRes.text();
  const chronologyEvents = parseChronologyHtml(chronologyHtml);

  const signals = detectSignals(plainText, record.title);
  if (chronologyEvents.length > 0) signals.chronologyEvents = chronologyEvents;

  const classification = classify(signals, plainText);
  return {
    pabId: record.pabId,
    url: record.url,
    title: record.title,
    classification,
    plainText,
    signals,
  };
}
