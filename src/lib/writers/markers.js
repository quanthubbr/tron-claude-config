'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const VERSION = 2;
const STYLES = {
  html: { start: `<!-- exonous:start v${VERSION} -->`, end: '<!-- exonous:end -->', startRe: /^[ \t]*<!-- exonous:start(?: v\d+)? -->[ \t]*(?=\r?$)/m, endRe: /^[ \t]*<!-- exonous:end -->[ \t]*(?=\r?$)/m },
  hash: { start: '# exonous:start', end: '# exonous:end', startRe: /^[ \t]*# exonous:start(?: v\d+)?[ \t]*(?=\r?$)/m, endRe: /^[ \t]*# exonous:end[ \t]*(?=\r?$)/m },
};

function styleOf(name) {
  const style = STYLES[name];
  if (!style) throw new Error(`unknown marker style: ${name}`);
  return style;
}

function normalizeBody(content, eol = '\n') {
  const text = String(content).replace(/\r\n/g, '\n').replace(/\n+$/, '');
  return text ? `${text}\n`.replace(/\n/g, eol) : '';
}

const eolOf = (text) => (text.includes('\r\n') ? '\r\n' : '\n');

function assertNoMarkers(body, style) {
  if (style.startRe.test(body) || style.endRe.test(body)) throw new Error('section body must not contain an exonous marker line');
}

function hashSection(body) {
  return crypto.createHash('sha256').update(body.replace(/\r\n/g, '\n')).digest('hex');
}

/** @returns {{ start: number, bodyStart: number, bodyEnd: number, end: number } | null | 'malformed'} */
function locate(text, style) {
  const s = style.startRe.exec(text);
  const firstEnd = style.endRe.exec(text);
  if (!s) return firstEnd ? 'malformed' : null;
  const afterStart = s.index + s[0].length;
  const e = style.endRe.exec(text.slice(afterStart));
  if (!e || (firstEnd && firstEnd.index < s.index)) return 'malformed';
  const lineBreak = /^\r?\n/.exec(text.slice(afterStart));
  const bodyStart = afterStart + (lineBreak ? lineBreak[0].length : 0);
  const bodyEnd = afterStart + e.index;
  return { start: s.index, bodyStart, bodyEnd, end: bodyEnd + e[0].length };
}

function readSection(text, styleName = 'html') {
  const span = locate(text, styleOf(styleName));
  return span && span !== 'malformed' ? text.slice(span.bodyStart, span.bodyEnd) : null;
}

/** @returns {{ status: 'written'|'unchanged'|'malformed', text: string }} */
function upsert(text, content, styleName = 'html') {
  const style = styleOf(styleName);
  const eol = eolOf(text);
  const body = normalizeBody(content, eol);
  assertNoMarkers(body, style);
  const block = `${style.start}${eol}${body}${style.end}`;
  const span = locate(text, style);
  if (span === 'malformed') return { status: 'malformed', text };
  let next;
  if (span) next = text.slice(0, span.start) + block + text.slice(span.end);
  else if (!text) next = `${block}${eol}`;
  // A file without a final newline gets none after the block either, so remove can tell the two apart.
  else next = text.endsWith('\n') ? `${text}${eol}${block}${eol}` : `${text}${eol}${eol}${block}`;
  return { status: next === text ? 'unchanged' : 'written', text: next };
}

/** @returns {{ status: 'removed'|'absent'|'malformed', text: string, body?: string }} */
function remove(text, styleName = 'html') {
  const span = locate(text, styleOf(styleName));
  if (span === 'malformed') return { status: 'malformed', text };
  if (!span) return { status: 'absent', text };
  const body = text.slice(span.bodyStart, span.bodyEnd);
  let before = text.slice(0, span.start);
  let after = text.slice(span.end);
  const eol = eolOf(text);
  const atEof = after === '';
  after = after.replace(/^\r?\n/, '');
  // Undo the separator upsert adds before an appended block: one blank line, plus the newline it added when there was none.
  if (!after && before.endsWith(eol + eol)) before = before.slice(0, atEof ? -2 * eol.length : -eol.length);
  return { status: 'removed', text: before + after, body };
}

/** Atomic replace that keeps the file's mode and writes through a symlink instead of replacing it. */
function writeAtomic(file, text) {
  let target = file;
  let mode = null;
  try {
    if (fs.lstatSync(file).isSymbolicLink()) target = fs.realpathSync(file);
    mode = fs.statSync(target).mode & 0o7777;
  } catch {
    // new file
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.exonous-${process.pid}-${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, text, { encoding: 'utf8', flag: 'wx', mode: mode ?? 0o666 });
  if (mode !== null) fs.chmodSync(tmp, mode);
  fs.renameSync(tmp, target);
}

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

/**
 * @param {{ style?: 'html'|'hash', dryRun?: boolean, log?: (msg: string) => void }} [options]
 * @returns {{ status: 'written'|'unchanged'|'malformed', hash?: string }}
 */
function upsertFile(file, content, { style = 'html', dryRun = false, log = () => {} } = {}) {
  const before = readText(file);
  const res = upsert(before || '', content, style);
  if (res.status === 'malformed') {
    log(`WARN: ${file} has an unmatched exonous marker — fix it by hand; file left untouched`);
    return { status: 'malformed' };
  }
  const hash = hashSection(normalizeBody(content));
  if (res.status === 'written') {
    if (dryRun) log(`DRY: would write exonous section → ${file}`);
    else writeAtomic(file, res.text);
  }
  return { status: res.status, hash };
}

/**
 * @param {{ style?: 'html'|'hash', dryRun?: boolean, log?: (msg: string) => void, keepEmpty?: boolean }} [options] keepEmpty: leave an empty file instead of deleting it.
 * @returns {{ status: 'removed'|'absent'|'malformed', body?: string }}
 */
function removeFile(file, { style = 'html', dryRun = false, log = () => {}, keepEmpty = false } = {}) {
  const before = readText(file);
  if (before === null) return { status: 'absent' };
  const res = remove(before, style);
  if (res.status === 'malformed') {
    log(`WARN: ${file} has an unmatched exonous marker — fix it by hand; file left untouched`);
    return { status: 'malformed' };
  }
  if (res.status === 'removed') {
    if (dryRun) log(`DRY: would remove exonous section from ${file}`);
    else if (res.text || keepEmpty) writeAtomic(file, res.text);
    else fs.rmSync(file, { force: true });
  }
  return { status: res.status, body: res.body };
}

module.exports = { upsert, remove, readSection, upsertFile, removeFile, normalizeBody, hashSection, writeAtomic, STYLES };
