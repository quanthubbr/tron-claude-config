'use strict';

// Rule files a dead home install left under ~/.claude/rules: always loaded, never ours to update, and they
// contradict nomos. Recognized by content: "edited" means a fingerprint phrase is gone, and such a file is kept and
// reported, never deleted. A file that still carries every phrase is retired whatever else was added to it, so the
// retired bytes always go to <name>.bak first and that copy never replaces one that is already there.
const fs = require('fs');
const path = require('path');
const paths = require('./paths');

/** Each entry needs every one of its phrases to count as the file the old install shipped. */
const ORPHANS = [
  { file: 'terse.md', phrases: ['# Terse Mode — always active', 'Default reply style for every session and every agent'] },
  { file: 'engineering-principles.md', phrases: ['# Engineering Principles — always active', 'How every agent writes, edits and reviews code'] },
  { file: 'harness-patterns.md', phrases: ['# Harness Patterns', 'Operational patterns derived from harness engineering principles'] },
  { file: 'harness-enforcement.md', phrases: ['# Harness Enforcement', 'When rules conflict'] },
  { file: 'agent-isolation.md', phrases: ['# Agent Isolation Contract', 'isolated, self-sufficient worker'] },
  { file: 'frontend-team-profile.md', phrases: ['# Frontend Team Profile', 'Writer and reviewer are always different agents'] },
];

const rulesDir = () => path.join(paths.claudeDir(), 'rules');

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

/**
 * @returns {{ file: string, path: string, recognized: boolean }[]} every orphan name that is still on disk
 */
function findOrphanRules() {
  return ORPHANS.flatMap(({ file, phrases }) => {
    const abs = path.join(rulesDir(), file);
    const text = readText(abs);
    if (text === null) return [];
    return [{ file, path: abs, recognized: phrases.every((p) => text.includes(p)) }];
  });
}

/**
 * Retires the files that still match what the old install shipped, keeping a `.bak` copy; anything else is reported.
 * @param {{ dryRun?: boolean, log: (msg: string) => void }} options
 * @returns {{ retired: string[], kept: string[] }}
 */
function retireOrphanRules({ dryRun = false, log }) {
  const retired = [];
  const kept = [];
  for (const orphan of findOrphanRules()) {
    const rel = `~/.claude/rules/${orphan.file}`;
    if (!orphan.recognized) {
      kept.push(orphan.file);
      log(`WARN: ${rel} is not from exonous and is loaded on every session, but it was edited — left alone; delete it by hand once you have read it`);
      continue;
    }
    retired.push(orphan.file);
    if (dryRun) {
      log(`DRY: would retire ${rel} (every byte kept as ${rel}.bak)`);
      continue;
    }
    try {
      // EXCL so a .bak you made — or a symlink pointing out of the rules dir — is never written through or replaced.
      fs.copyFileSync(orphan.path, `${orphan.path}.bak`, fs.constants.COPYFILE_EXCL);
    } catch (err) {
      retired.pop();
      kept.push(orphan.file);
      const reason = err.code === 'EEXIST' ? `${rel}.bak already exists` : err.message;
      log(`WARN: ${rel} not retired (${reason}) — left alone; move ${rel}.bak aside and rerun \`exonous install\`, or delete ${rel} by hand`);
      continue;
    }
    fs.rmSync(orphan.path, { force: true });
    log(`retired ${rel} from an older install — every byte of it, your additions included, kept as ${rel}.bak`);
  }
  return { retired, kept };
}

/** One doctor row for every orphan rule file still loaded on each session. */
function orphanRulesRow() {
  const left = findOrphanRules();
  return {
    name: 'no rule files from older installs in ~/.claude/rules',
    ok: !left.length,
    status: left.map((o) => `${o.file}${o.recognized ? '' : ' (edited)'}`).join(', '),
    fix: left.every((o) => o.recognized) ? 'exonous install' : 'exonous install retires the untouched ones; read and delete the edited ones by hand',
  };
}

module.exports = { ORPHANS, findOrphanRules, retireOrphanRules, orphanRulesRow };
