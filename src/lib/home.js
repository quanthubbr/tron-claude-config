'use strict';

// Home-file ledger: a hash per written file, so an upgrade deletes files a release dropped and keeps the ones the user edited.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const paths = require('./paths');
const markers = require('./writers/markers');

const EXECUTABLE_EXTS = new Set(['', '.sh', '.cmd']);

function ledgerPath() {
  return path.join(paths.exoDir(), 'installed.json');
}

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function homeRel(abs) {
  return path.relative(paths.home(), abs).split(path.sep).join('/');
}

/** Absolute path for a ledger entry, or null when the entry is absolute or escapes the home. */
function contained(rel) {
  if (typeof rel !== 'string' || !rel || path.isAbsolute(rel)) return null;
  const base = path.resolve(paths.home());
  const abs = path.resolve(base, rel);
  return abs.startsWith(base + path.sep) ? abs : null;
}

function readLedgerFile(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function readLedger(file = ledgerPath()) {
  const data = readLedgerFile(file);
  return data ? data.files || {} : null;
}

const sectionKey = (entry) => `${entry.path}#${entry.marker}`;

// v2.0 ledgers stored a bare hash per file; those entries belong to no tool and are always prunable.
const fileEntry = (value) => (typeof value === 'string' ? { hash: value } : value);
/** True when a parent directory of the ledger path (below the home) is a symlink: the file there belongs to its target. */
function throughLink(rel) {
  let cur = paths.home();
  for (const seg of rel.split('/').slice(0, -1)) {
    cur = path.join(cur, seg);
    try {
      if (fs.lstatSync(cur).isSymbolicLink()) return true;
    } catch {
      return false;
    }
  }
  return false;
}

const prunable = (entry, tools) => !tools || !entry.tool || entry.tool === 'shared' || tools.includes(entry.tool);

/**
 * @typedef {{ path: string, marker: 'html'|'hash', hash: string, tool?: string }} SectionEntry
 * @param {{ dryRun?: boolean, log: (msg: string) => void, previous?: Record<string, string>, previousSections?: SectionEntry[] }} options
 */
function createHome({ dryRun = false, log, previous, previousSections }) {
  const ledger = {
    previous: Object.fromEntries(Object.entries(previous || readLedger() || {}).map(([rel, v]) => [rel, fileEntry(v)])),
    current: {},
    previousSections: previousSections || readLedgerFile(ledgerPath())?.sections || [],
    currentSections: [],
    complete: true,
  };

  /** @param {{ tool?: string }} [options] adapter id, or 'shared' */
  function write(destAbs, content, { tool = 'shared' } = {}) {
    const rel = homeRel(destAbs);
    const hash = sha256(content);
    ledger.current[rel] = { hash, tool };
    if (dryRun) {
      log(`DRY: would sync ~/${rel}`);
      return;
    }
    try {
      const onDisk = fs.existsSync(destAbs) ? sha256(fs.readFileSync(destAbs)) : null;
      // A file that matches neither this release nor the last one we wrote holds the user's edits.
      if (onDisk && onDisk !== hash && onDisk !== (ledger.previous[rel] || {}).hash) {
        fs.copyFileSync(destAbs, `${destAbs}.bak`);
        log(`kept your edits to ~/${rel} as ~/${rel}.bak`);
      }
      fs.mkdirSync(path.dirname(destAbs), { recursive: true });
      fs.writeFileSync(destAbs, content);
    } catch (err) {
      ledger.complete = false;
      log(`WARN: ~/${rel} not synced: ${err.message}`);
    }
  }

  /** Records a file another step writes (e.g. a staged dir swap) so prune keeps it. */
  function track(destAbs, content, { tool = 'shared' } = {}) {
    ledger.current[homeRel(destAbs)] = { hash: sha256(content), tool };
  }

  function sync(srcAbs, destAbs, options) {
    let content;
    try {
      content = fs.readFileSync(srcAbs);
    } catch (err) {
      ledger.complete = false;
      log(`WARN: ~/${homeRel(destAbs)} not synced: ${err.message}`);
      return;
    }
    write(destAbs, content, options);
  }

  function copyTree(srcAbs, destAbs, { exclude = ['__pycache__', '.DS_Store'] } = {}) {
    if (dryRun) {
      log(`DRY: would copy ${srcAbs} → ~/${homeRel(destAbs)}`);
      return;
    }
    fs.mkdirSync(destAbs, { recursive: true });
    for (const entry of fs.readdirSync(srcAbs, { withFileTypes: true })) {
      if (exclude.includes(entry.name)) continue;
      const from = path.join(srcAbs, entry.name);
      const to = path.join(destAbs, entry.name);
      if (entry.isDirectory()) {
        copyTree(from, to, { exclude });
      } else if (entry.isFile()) {
        fs.copyFileSync(from, to);
        if (EXECUTABLE_EXTS.has(path.extname(entry.name))) {
          try {
            fs.chmodSync(to, 0o755);
          } catch {
            // chmod is unsupported on some filesystems; the file is still usable through its interpreter.
          }
        }
      }
    }
  }

  function link(targetAbs, linkAbs) {
    try {
      const stat = fs.lstatSync(linkAbs);
      if (stat.isSymbolicLink() && fs.realpathSync(linkAbs) === fs.realpathSync(targetAbs)) return;
    } catch {
      // missing link: create it below
    }
    if (dryRun) {
      log(`DRY: would link ~/${homeRel(linkAbs)} → ~/${homeRel(targetAbs)}`);
      return;
    }
    fs.rmSync(linkAbs, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(linkAbs), { recursive: true });
    try {
      fs.symlinkSync(targetAbs, linkAbs, 'dir');
    } catch {
      copyTree(targetAbs, linkAbs);
    }
  }

  function remove(abs, label = `~/${homeRel(abs)}`) {
    let stat;
    try {
      stat = fs.lstatSync(abs);
    } catch {
      return false;
    }
    if (dryRun) {
      log(`DRY: would remove ${label}`);
      return true;
    }
    if (stat.isSymbolicLink()) fs.unlinkSync(abs);
    else fs.rmSync(abs, { recursive: true, force: true });
    log(`removed ${label}`);
    return true;
  }

  /** @param {{ style?: string, tool?: string, writer?: (file: string) => { status: string, hash?: string } }} [options] writer replaces the plain marker upsert (e.g. TOML tables). */
  function section(destAbs, content, { style = 'html', tool, writer } = {}) {
    const rel = homeRel(destAbs);
    const existed = fs.existsSync(destAbs);
    let res;
    try {
      res = writer ? writer(destAbs) : markers.upsertFile(destAbs, content, { style, dryRun, log });
    } catch (err) {
      ledger.complete = false;
      log(`WARN: ~/${rel} section not synced: ${err.message}`);
      return;
    }
    const old = ledger.previousSections.find((e) => sectionKey(e) === `${rel}#${style}`);
    // A file exonous created may go when its section does; one the user had (even empty) always stays.
    const created = Boolean(old ? old.created : !existed);
    const entry = { path: rel, marker: style, hash: res.hash, ...(tool ? { tool } : {}), ...(created ? { created } : {}) };
    if (res.status !== 'malformed') {
      if (res.hash) ledger.currentSections.push(entry);
      return;
    }
    // Unmanageable now, but still ours: keep the old entry so prune does not retire it.
    if (old) ledger.currentSections.push(old);
  }

  /** @param {SectionEntry} entry */
  function removeSection(entry) {
    const abs = contained(entry.path);
    if (!abs) {
      log(`WARN: ledger section ${entry.path} points outside the home — left alone`);
      return;
    }
    let text;
    try {
      text = fs.readFileSync(abs, 'utf8');
    } catch {
      return;
    }
    const body = markers.readSection(text, entry.marker);
    if (body === null) return;
    if (markers.hashSection(body) !== entry.hash) {
      const bak = `${abs}.exonous-section.bak`;
      if (dryRun) log(`DRY: would keep your edits to the exonous section of ~/${entry.path} as ~/${entry.path}.exonous-section.bak`);
      else {
        fs.writeFileSync(bak, body, 'utf8');
        log(`kept your edits to the exonous section of ~/${entry.path} as ~/${entry.path}.exonous-section.bak`);
      }
    }
    if (markers.removeFile(abs, { style: entry.marker, dryRun, log, keepEmpty: !entry.created }).status === 'removed' && !dryRun) {
      log(`retired exonous section from ~/${entry.path}`);
    }
  }

  // A partial run would make every unsynced file look retired, so the old ledger is kept instead.
  function prune(version, { tools } = {}) {
    const current = new Set(ledger.currentSections.map(sectionKey));
    const retired = ledger.previousSections.filter((e) => !current.has(sectionKey(e)));
    if (!ledger.complete) {
      log('WARN: some files failed to sync — stale-file cleanup skipped until the next clean run');
      ledger.current = { ...ledger.previous, ...ledger.current };
      ledger.currentSections.push(...retired);
    } else {
      for (const entry of retired) {
        if (tools && entry.tool && !tools.includes(entry.tool)) ledger.currentSections.push(entry);
        else removeSection(entry);
      }
      for (const [rel, entry] of Object.entries(ledger.previous)) {
        if (rel in ledger.current) continue;
        if (!prunable(entry, tools)) {
          ledger.current[rel] = entry;
          continue;
        }
        const target = contained(rel);
        if (!target) {
          log(`WARN: ledger entry ${rel} points outside the home — left alone`);
          continue;
        }
        if (!fs.existsSync(target) || throughLink(rel)) continue;
        if (sha256(fs.readFileSync(target)) !== entry.hash) {
          log(`kept ~/${rel} (edited since install; no longer managed)`);
          continue;
        }
        remove(target, `retired ~/${rel}`);
      }
    }
    if (dryRun) return;
    fs.mkdirSync(paths.exoDir(), { recursive: true, mode: 0o700 });
    const data = { version, files: ledger.current, sections: ledger.currentSections };
    fs.writeFileSync(ledgerPath(), `${JSON.stringify(data, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  }

  return { write, track, sync, copyTree, link, remove, section, removeSection, prune, ledger };
}

module.exports = { createHome, readLedger, readLedgerFile, homeRel, sha256, ledgerPath, contained, throughLink };
