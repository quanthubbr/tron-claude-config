#!/usr/bin/env node
// sync-tron-kit.js — MAINTAINER ONLY: refresh the frozen managed/tron-kit/ snapshot from upstream
// Usage: npm run sync:tron-kit [-- --dry-run] [-- --latest] [-- --ref <sha|branch>]
// Config (upstream pin, include/exclude, rewrites): managed/tron-kit.config.json

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const PACKAGE_ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(PACKAGE_ROOT, 'managed', 'tron-kit.config.json');
const TARGET_ROOT = path.join(PACKAGE_ROOT, 'managed', 'tron-kit');
const PACKAGE_VERSION = JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8')).version;

function log(msg) {
  process.stdout.write(`[sync-tron-kit] ${msg}\n`);
}

function parseArgs(argv) {
  const args = { dryRun: false, latest: false, ref: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--latest') args.latest = true;
    else if (arg === '--ref') {
      args.ref = argv[++i];
      if (!args.ref) throw new Error('--ref requires a value (sha or branch)');
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  if (args.latest && args.ref) throw new Error('--latest and --ref are mutually exclusive');
  return args;
}

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 180000 }).trim();
}

function fetchUpstream(repo, ref, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  git(destDir, 'init', '--quiet');
  git(destDir, 'remote', 'add', 'origin', repo);
  try {
    git(destDir, 'fetch', '--quiet', '--depth=1', 'origin', ref);
  } catch (err) {
    throw new Error(`git fetch ${repo} ${ref} failed: ${(err.stderr || err.message).toString().trim()}`);
  }
  git(destDir, 'checkout', '--quiet', '--detach', 'FETCH_HEAD');
  return git(destDir, 'rev-parse', 'HEAD');
}

function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    if (ch === '*' && glob[i + 1] === '*') {
      if (glob[i + 2] === '/') {
        re += '(?:.*/)?';
        i += 2;
      } else {
        re += '.*';
        i += 1;
      }
    } else if (ch === '*') re += '[^/]*';
    else if (ch === '?') re += '[^/]';
    else re += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

function compileExcludes(patterns) {
  return patterns.map((pattern) => ({
    pattern,
    file: globToRegExp(pattern),
    dir: pattern.endsWith('/**') ? globToRegExp(pattern.slice(0, -3)) : null,
  }));
}

function toPosix(rel) {
  return rel.split(path.sep).join('/');
}

// Copies srcAbs → destAbs, skipping excluded paths. Returns repo-relative excluded entries.
function copyFiltered(srcRoot, rel, destRoot, excludes, excluded) {
  const srcAbs = path.join(srcRoot, rel);
  const stat = fs.lstatSync(srcAbs);
  const relPosix = toPosix(rel);

  if (stat.isDirectory()) {
    if (excludes.some((e) => e.dir && e.dir.test(relPosix))) {
      excluded.push(`${relPosix}/`);
      return;
    }
    fs.mkdirSync(path.join(destRoot, rel), { recursive: true });
    for (const name of fs.readdirSync(srcAbs)) {
      copyFiltered(srcRoot, path.join(rel, name), destRoot, excludes, excluded);
    }
    return;
  }

  if (excludes.some((e) => e.file.test(relPosix))) {
    excluded.push(relPosix);
    return;
  }
  fs.mkdirSync(path.dirname(path.join(destRoot, rel)), { recursive: true });
  if (stat.isSymbolicLink()) {
    fs.symlinkSync(fs.readlinkSync(srcAbs), path.join(destRoot, rel));
  } else {
    fs.copyFileSync(srcAbs, path.join(destRoot, rel));
  }
}

function listFiles(root, rel = '') {
  const out = [];
  for (const entry of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
    const child = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...listFiles(root, child));
    else if (entry.isFile()) out.push(child);
  }
  return out;
}

function applyRewrites(stageRoot, rewrites) {
  const files = listFiles(stageRoot);
  const results = [];
  for (const rule of rewrites) {
    const targets = new Set();
    for (const pattern of rule.files) {
      if (!/[*?]/.test(pattern)) {
        if (!fs.existsSync(path.join(stageRoot, pattern))) {
          throw new Error(`Rewrite "${rule.id}": file ${pattern} not found in upstream snapshot — upstream drifted, update managed/tron-kit.config.json`);
        }
        targets.add(pattern);
        continue;
      }
      const re = globToRegExp(pattern);
      for (const file of files) if (re.test(file)) targets.add(file);
    }

    const perFile = {};
    let total = 0;
    for (const file of targets) {
      const abs = path.join(stageRoot, file);
      const content = fs.readFileSync(abs, 'utf8');
      const count = content.split(rule.find).length - 1;
      if (count === 0) continue;
      fs.writeFileSync(abs, content.split(rule.find).join(rule.replace), 'utf8');
      perFile[file] = count;
      total += count;
    }

    const min = rule.minMatches ?? 1;
    if (total < min) {
      throw new Error(`Rewrite "${rule.id}" matched ${total} time(s), expected at least ${min} — upstream drifted, update managed/tron-kit.config.json`);
    }
    results.push({ id: rule.id, matches: total, files: perFile });
  }
  return results;
}

function stripHookMatcherKeys(stageRoot, hooksConfig) {
  if (!hooksConfig || !hooksConfig.stripMatcherKeys?.length) return;
  const hooksPath = path.join(stageRoot, hooksConfig.file);
  if (!fs.existsSync(hooksPath)) throw new Error(`hooks file missing in upstream snapshot: ${hooksConfig.file}`);
  const hooksJson = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
  for (const matchers of Object.values(hooksJson.hooks || {})) {
    for (const matcher of matchers) {
      for (const key of hooksConfig.stripMatcherKeys) delete matcher[key];
    }
  }
  fs.writeFileSync(hooksPath, `${JSON.stringify(hooksJson, null, 2)}\n`, 'utf8');
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writePluginManifests(upstreamRoot, stageRoot, config) {
  const upstreamPluginPath = path.join(upstreamRoot, '.claude-plugin', 'plugin.json');
  if (!fs.existsSync(upstreamPluginPath)) throw new Error('upstream .claude-plugin/plugin.json missing — upstream drifted');
  const upstreamPlugin = JSON.parse(fs.readFileSync(upstreamPluginPath, 'utf8'));
  const { name, description, author, license, keywords } = config.plugin;

  writeJson(path.join(stageRoot, '.claude-plugin', 'plugin.json'), {
    name,
    version: PACKAGE_VERSION,
    description,
    author,
    license,
    keywords,
    mcpServers: upstreamPlugin.mcpServers ?? {},
    skills: upstreamPlugin.skills ?? ['./skills/'],
    commands: upstreamPlugin.commands ?? ['./commands/'],
  });

  writeJson(path.join(stageRoot, '.claude-plugin', 'marketplace.json'), {
    name: config.marketplace.name,
    owner: config.marketplace.owner,
    metadata: { description: config.marketplace.description },
    plugins: [
      {
        name,
        source: './',
        description,
        version: PACKAGE_VERSION,
        author,
        license,
        keywords,
        category: 'workflow',
        strict: false,
      },
    ],
  });
}

function countSnapshot(root) {
  const dirs = (rel) => (fs.existsSync(path.join(root, rel))
    ? fs.readdirSync(path.join(root, rel), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
    : []);
  const mdFiles = (rel) => (fs.existsSync(path.join(root, rel))
    ? fs.readdirSync(path.join(root, rel)).filter((f) => f.endsWith('.md'))
    : []);
  const hooksJson = JSON.parse(fs.readFileSync(path.join(root, 'hooks', 'hooks.json'), 'utf8'));
  let hooks = 0;
  for (const matchers of Object.values(hooksJson.hooks || {})) {
    for (const matcher of matchers) hooks += matcher.hooks.length;
  }
  return {
    skills: dirs('skills').filter((d) => fs.existsSync(path.join(root, 'skills', d, 'SKILL.md'))).length,
    agents: mdFiles('agents').length,
    commands: mdFiles('commands').length,
    hooks,
    hookEvents: Object.keys(hooksJson.hooks || {}),
    ruleFolders: dirs('rules'),
  };
}

function updateConfigRef(oldRef, newRef) {
  const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
  const needle = `"ref": "${oldRef}"`;
  if (!raw.includes(needle)) throw new Error(`could not locate ${needle} in ${CONFIG_PATH}`);
  fs.writeFileSync(CONFIG_PATH, raw.replace(needle, `"ref": "${newRef}"`), 'utf8');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const requestedRef = args.latest ? 'HEAD' : (args.ref || config.upstream.ref);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tron-kit-sync-'));
  try {
    const upstreamRoot = path.join(tmpDir, 'upstream');
    const stageRoot = path.join(tmpDir, 'stage');
    log(`fetching ${config.upstream.repo} @ ${requestedRef}`);
    const sha = fetchUpstream(config.upstream.repo, requestedRef, upstreamRoot);
    log(`resolved upstream sha ${sha}`);

    const excludes = compileExcludes(config.exclude);
    const excluded = [];
    fs.mkdirSync(stageRoot, { recursive: true });
    for (const entry of config.include) {
      if (!fs.existsSync(path.join(upstreamRoot, entry))) {
        throw new Error(`include path "${entry}" missing upstream — upstream drifted, update managed/tron-kit.config.json`);
      }
      copyFiltered(upstreamRoot, entry, stageRoot, excludes, excluded);
    }

    const rewriteResults = applyRewrites(stageRoot, config.rewrites);
    stripHookMatcherKeys(stageRoot, config.hooks);
    writePluginManifests(upstreamRoot, stageRoot, config);

    const upstreamVersion = fs.existsSync(path.join(stageRoot, 'VERSION'))
      ? fs.readFileSync(path.join(stageRoot, 'VERSION'), 'utf8').trim()
      : null;
    writeJson(path.join(stageRoot, 'UPSTREAM.json'), {
      repo: config.upstream.repo,
      ref: sha,
      upstreamVersion,
      syncedAt: new Date().toISOString(),
      excluded,
      rewrites: rewriteResults.map(({ id, matches }) => ({ id, matches })),
    });

    const counts = countSnapshot(stageRoot);
    log(`upstream version ${upstreamVersion ?? '(unknown)'}`);
    log(`skills=${counts.skills} agents=${counts.agents} commands=${counts.commands} hooks=${counts.hooks} [${counts.hookEvents.join(', ')}]`);
    log(`rule folders (${counts.ruleFolders.length}): ${counts.ruleFolders.join(', ')}`);
    log(`excluded (${excluded.length}): ${excluded.join(', ') || '(none)'}`);
    for (const result of rewriteResults) {
      const files = Object.entries(result.files).map(([file, n]) => `${file}×${n}`).join(', ');
      log(`rewrite ${result.id}: ${result.matches} match(es) — ${files}`);
    }

    if (args.dryRun) {
      log('DRY: managed/tron-kit/ left untouched');
      return;
    }

    fs.rmSync(TARGET_ROOT, { recursive: true, force: true });
    fs.cpSync(stageRoot, TARGET_ROOT, { recursive: true, verbatimSymlinks: true });
    log(`snapshot written → ${path.relative(PACKAGE_ROOT, TARGET_ROOT)}/`);

    if (sha !== config.upstream.ref) {
      updateConfigRef(config.upstream.ref, sha);
      log(`upstream.ref updated → ${sha}`);
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

try {
  main();
} catch (err) {
  process.stderr.write(`[sync-tron-kit] ERROR: ${err.message}\n`);
  process.exit(1);
}
