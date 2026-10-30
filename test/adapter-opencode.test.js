#!/usr/bin/env node
'use strict';

require('./helpers/tmp-cleanup');

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { test } = require('node:test');
const { install } = require('../src/install');
const { uninstall } = require('../src/uninstall');
const { selftest, ADAPTERS } = require('../src/adapters');
const { splitFrontmatter } = require('../src/lib/convert/md-command');
const fx = require('./helpers/adapter-fixture');

const osHome = fx.useFixtureHome();
const opencode = ADAPTERS.find((a) => a.id === 'opencode');
const DIR = ['.config', 'opencode'];
const USER_CONFIG = { $schema: 'https://opencode.ai/config.json', theme: 'tokyonight', instructions: ['~/notes/rules.md'], mcp: { jira: { type: 'remote', url: 'https://jira.example/mcp' } } };

function seed() {
  fx.write(USER_CONFIG, ...DIR, 'opencode.json');
  fx.write('# my command\n', ...DIR, 'commands', 'mine.md');
  fx.write(fx.CLAUDE_MCP, '.claude', '.mcp.json');
}
const RULE_FILES = () => ['nomos.md', 'praxis.md'].map((name) => fx.home('.claude', 'exonous', 'rules', name));
const run = (opts = {}) => install({ external: false, execPath: process.execPath, tools: ['opencode'], ...fx.quiet(), ...opts });

/** Runs the generated ESM plugin under node: calls `tool.execute.before` and the session event, prints what happened. */
function drive(pluginSource, calls) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-plugin-'));
  const file = path.join(dir, 'exonous.mjs');
  fs.writeFileSync(file, pluginSource);
  const script = `
    const m = await import(${JSON.stringify(`file://${file}`)});
    const hooks = await m.ExonousGate({ directory: ${JSON.stringify(os.tmpdir())} });
    const out = [];
    for (const [tool, command] of ${JSON.stringify(calls)}) {
      try { await hooks['tool.execute.before']({ tool }, { args: { command } }); out.push('allow'); }
      catch (e) { out.push('deny:' + e.message); }
    }
    await hooks.event({ event: { type: 'session.created' } });
    console.log(JSON.stringify(out));`;
  const res = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', env: process.env });
  assert.strictEqual(res.status, 0, res.stderr);
  return JSON.parse(res.stdout);
}

test('detects ~/.config/opencode or opencode on PATH', () => {
  assert.strictEqual(opencode.detect(), false);
  fs.mkdirSync(fx.home(...DIR), { recursive: true });
  assert.strictEqual(opencode.detect(), true);
  assert.strictEqual(opencode.tier, 1);
});

test('install: plugin, instructions entry (no AGENTS.md), owned mcp, commands and subagents; user config kept', () => {
  seed();
  run();
  const plugin = fx.read(...DIR, 'plugins', 'exonous.js');
  assert.ok(plugin.includes(JSON.stringify(fx.home('.claude', 'exonous', 'hooks', 'pyle.cjs'))));
  assert.ok(!plugin.includes('__EXONOUS_'));
  const config = fx.readJson(...DIR, 'opencode.json');
  assert.strictEqual(config.theme, 'tokyonight');
  assert.deepStrictEqual(config.instructions, ['~/notes/rules.md', ...RULE_FILES()]);
  assert.deepStrictEqual(config.mcp.jira, USER_CONFIG.mcp.jira);
  assert.deepStrictEqual(config.mcp.atlas, { type: 'local', command: ['/usr/local/bin/codebase-memory-mcp', '--stdio'], enabled: true });
  assert.deepStrictEqual(config.mcp.biblos, { type: 'remote', url: 'https://mcp.context7.com/mcp', enabled: true });
  assert.ok(!/secret/i.test(JSON.stringify(config)));
  assert.ok(!fx.exists(...DIR, 'AGENTS.md'), 'never shadows the ~/.claude/CLAUDE.md fallback');
  assert.strictEqual(fx.read(...DIR, 'commands', 'mine.md'), '# my command\n');
  assert.ok(splitFrontmatter(fx.read(...DIR, 'commands', 'make-pr.md')).fields.description);
  const agents = fs.readdirSync(fx.home(...DIR, 'agents')).filter((f) => /^exo-.+\.md$/.test(f));
  assert.strictEqual(agents.length, 12);
  assert.strictEqual(splitFrontmatter(fx.read(...DIR, 'agents', 'exo-qa.md')).fields.mode, 'subagent');
});

test('idempotent', () => {
  seed();
  run();
  const files = ['opencode.json', 'plugins/exonous.js', 'commands/make-pr.md', 'agents/exo-qa.md'];
  const snap = files.map((f) => fx.read(...DIR, f));
  run();
  assert.deepStrictEqual(files.map((f) => fx.read(...DIR, f)), snap);
});

test('opencode.json with comments (JSONC) is left untouched with a warning; opencode.jsonc alone is never edited', () => {
  fx.write('{\n  // mine\n  "theme": "x"\n}\n', ...DIR, 'opencode.json');
  const q = fx.quiet();
  install({ external: false, execPath: process.execPath, tools: ['opencode'], ...q });
  assert.strictEqual(fx.read(...DIR, 'opencode.json'), '{\n  // mine\n  "theme": "x"\n}\n');
  assert.ok(q.logs.some((m) => /opencode\.json is not valid JSON/.test(m)));
  fs.rmSync(fx.home(...DIR, 'opencode.json'));
  fx.write('{ /* c */ }\n', ...DIR, 'opencode.jsonc');
  const q2 = fx.quiet();
  install({ external: false, execPath: process.execPath, tools: ['opencode'], ...q2 });
  assert.ok(!fx.exists(...DIR, 'opencode.json'));
  assert.strictEqual(fx.read(...DIR, 'opencode.jsonc'), '{ /* c */ }\n');
  assert.ok(q2.logs.some((m) => /opencode\.jsonc/.test(m)));
  assert.ok(q2.logs.some((m) => /^⚠ opencode: rules NOT active — /.test(m)), q2.logs.join('\n'));
  assert.ok(!q2.logs.some((m) => /opencode: gate NOT active/.test(m)), 'the plugin gate does not depend on opencode.json');
});

test('--rewrite-jsonc edits a JSONC-only opencode.jsonc in place', () => {
  fx.write('{\n  /* c */ "theme": "x",\n}\n', ...DIR, 'opencode.jsonc');
  const res = install({ external: false, execPath: process.execPath, tools: ['opencode'], rewriteJsonc: true, ...fx.quiet() });
  assert.deepStrictEqual(res.inactive, []);
  assert.ok(!fx.exists(...DIR, 'opencode.json'));
  const config = JSON.parse(fx.read(...DIR, 'opencode.jsonc'));
  assert.strictEqual(config.theme, 'x');
  assert.deepStrictEqual(config.instructions, RULE_FILES());
});

test('the plugin blocks git commit through pyle, lets other commands and tools through, and spawns kairos on session.created', async () => {
  seed();
  run();
  const marker = path.join(fx.home(), 'kairos-ran');
  const fakeKairos = path.join(fx.home(), 'fake-kairos.cjs');
  fs.writeFileSync(fakeKairos, `require('fs').writeFileSync(${JSON.stringify(marker)}, process.argv.slice(2).join(' '));`);
  const source = opencode.renderPlugin({ node: process.execPath, kairos: fakeKairos });
  const out = drive(source, [['bash', 'git commit -m x'], ['bash', 'ls -la'], ['read', 'git commit -m x'], ['shell', 'git push --force']]);
  assert.match(out[0], /^deny:.*exonous/);
  assert.deepStrictEqual(out.slice(1, 3), ['allow', 'allow']);
  assert.match(out[3], /^deny:/);
  for (let i = 0; i < 100 && !fs.existsSync(marker); i++) await new Promise((r) => setTimeout(r, 50));
  assert.strictEqual(fs.readFileSync(marker, 'utf8'), '--adapter opencode');
});

test('the plugin fails closed for git/gh when the gate cannot run, and open for anything else', () => {
  const missing = opencode.renderPlugin({ node: process.execPath, pyle: fx.home('no-such-pyle.cjs') });
  assert.deepStrictEqual(drive(missing, [['bash', 'git commit -m x'], ['bash', 'gh pr create'], ['bash', 'ls -la']]).map((r) => r.split(':')[0]), ['deny', 'deny', 'allow']);
  const noNode = opencode.renderPlugin({ node: fx.home('no-such-node') });
  const out = drive(noNode, [['shell', 'git push'], ['shell', 'echo digit']]);
  assert.match(out[0], /^deny:exonous: gate unavailable/);
  assert.strictEqual(out[1], 'allow');
});

test('workdir is resolved against the session directory', () => {
  const source = opencode.renderPlugin({ node: process.execPath, pyle: fx.home('echo-cwd.cjs') });
  fs.writeFileSync(fx.home('echo-cwd.cjs'), "let s='';process.stdin.on('data',(d)=>{s+=d}).on('end',()=>{process.stderr.write(JSON.parse(s).cwd);process.exit(2)});");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-wd-'));
  const script = `const m = await import(${JSON.stringify(`file://${dir}/p.mjs`)});
const h = await m.ExonousGate({ directory: ${JSON.stringify(dir)} });
try { await h['tool.execute.before']({ tool: 'bash' }, { args: { command: 'git status', workdir: 'sub' } }); } catch (e) { console.log(e.message); }`;
  fs.writeFileSync(path.join(dir, 'p.mjs'), source);
  const res = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' });
  assert.strictEqual(res.stdout.trim(), path.join(dir, 'sub'));
});

test('uninstall removes plugin, commands, agents and only our config entries', async () => {
  seed();
  run();
  await uninstall({ yes: true, log: () => {} });
  assert.deepStrictEqual(fx.readJson(...DIR, 'opencode.json'), USER_CONFIG);
  assert.ok(!fx.exists(...DIR, 'plugins', 'exonous.js'));
  assert.ok(!fx.exists(...DIR, 'commands', 'make-pr.md'));
  assert.ok(!fx.exists(...DIR, 'agents', 'exo-qa.md'));
  assert.strictEqual(fx.read(...DIR, 'commands', 'mine.md'), '# my command\n');
});

test('selftest runs the installed plugin gate on a synthetic event and expects a deny', () => {
  seed();
  run();
  const res = selftest(opencode);
  assert.ok(res.ok, res.detail);
  const rows = opencode.doctor({});
  assert.ok(rows.every((r) => r.ok), JSON.stringify(rows));
  assert.deepStrictEqual(fs.readdirSync(osHome.osHome), []);
});

test('selftest reports a temp-repo failure instead of throwing', () => {
  seed();
  run();
  const saved = process.env.PATH;
  // A distro node lives in /usr/bin next to git, so PATH gets a dir holding only node.
  const nodeOnly = fs.mkdtempSync(path.join(os.tmpdir(), 'node-only-'));
  if (process.platform === 'win32') fs.copyFileSync(process.execPath, path.join(nodeOnly, 'node.exe'));
  else fs.symlinkSync(process.execPath, path.join(nodeOnly, 'node'));
  process.env.PATH = nodeOnly;
  try {
    const res = selftest(opencode);
    assert.strictEqual(res.ok, false);
    assert.match(res.detail, /could not create a temp git repo/);
  } finally {
    process.env.PATH = saved;
    fs.rmSync(nodeOnly, { recursive: true, force: true });
  }
});

