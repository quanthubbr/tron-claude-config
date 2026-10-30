'use strict';

// Home-file ledger: a hash per written file, so an upgrade deletes files a release dropped and keeps the ones the user edited.
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const STATE_DIR = path.join(os.homedir(), '.claude', 'exonous');
const LEDGER_PATH = path.join(STATE_DIR, 'installed.json');
const EXECUTABLE_EXTS = new Set(['', '.sh', '.cmd']);

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function homeRel(abs) {
  return path.relative(os.homedir(), abs).split(path.sep).join('/');
}

function readLedger(file = LEDGER_PATH) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')).files || {};
  } catch {
    return null;
  }
}

/**
 * @param {{ dryRun?: boolean, log: (msg: string) => void, previous?: Record<string, string> }} options
 */
function createHome({ dryRun = false, log, previous }) {
  const ledger = { previous: previous || readLedger() || {}, current: {}, complete: true };

  function write(destAbs, content) {
    const rel = homeRel(destAbs);
    const hash = sha256(content);
    ledger.current[rel] = hash;
    if (dryRun) {
      log(`DRY: would sync ~/${rel}`);
      return;
    }
    try {
      const onDisk = fs.existsSync(destAbs) ? sha256(fs.readFileSync(destAbs)) : null;
      // A file that matches neither this release nor the last one we wrote holds the user's edits.
      if (onDisk && onDisk !== hash && onDisk !== ledger.previous[rel]) {
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

  function sync(srcAbs, destAbs) {
    let content;
    try {
      content = fs.readFileSync(srcAbs);
    } catch (err) {
      ledger.complete = false;
      log(`WARN: ~/${homeRel(destAbs)} not synced: ${err.message}`);
      return;
    }
    write(destAbs, content);
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

  // A partial run would make every unsynced file look retired, so the old ledger is kept instead.
  function prune(version) {
    if (!ledger.complete) {
      log('WARN: some files failed to sync — stale-file cleanup skipped until the next clean run');
      ledger.current = { ...ledger.previous, ...ledger.current };
    } else {
      for (const [rel, hash] of Object.entries(ledger.previous)) {
        if (rel in ledger.current) continue;
        const target = path.join(os.homedir(), rel);
        if (!fs.existsSync(target)) continue;
        if (sha256(fs.readFileSync(target)) !== hash) {
          log(`kept ~/${rel} (edited since install; no longer managed)`);
          continue;
        }
        remove(target, `retired ~/${rel}`);
      }
    }
    if (dryRun) return;
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(LEDGER_PATH, `${JSON.stringify({ version, files: ledger.current }, null, 2)}\n`, 'utf8');
  }

  return { write, sync, copyTree, link, remove, prune, ledger };
}

module.exports = { createHome, readLedger, homeRel, sha256, STATE_DIR, LEDGER_PATH };
