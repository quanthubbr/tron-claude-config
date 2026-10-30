#!/usr/bin/env node
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { test } = require('node:test');
const { removeWorkflowEngine } = require('../src/legacy/workflow-engine');

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function fakeHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-engine-'));
  const claude = path.join(home, '.claude');
  const hash = (s) => crypto.createHash('sha256').update(s).digest('hex');
  write(path.join(claude, 'gsd-core', 'VERSION'), '1.16.0');
  write(path.join(claude, 'skills', 'gsd-quick', 'SKILL.md'), 'x');
  write(path.join(claude, 'skills', 'deliver', 'SKILL.md'), 'keep');
  write(path.join(claude, 'hooks', 'gsd-read-guard.js'), 'x');
  write(path.join(claude, 'hooks', 'lib', 'git-cmd.js'), 'engine');
  write(path.join(claude, 'scripts', 'lib', 'edited.cjs'), 'user edit');
  write(path.join(claude, '.gsd-profile'), 'standard');
  write(path.join(claude, 'gsd-file-manifest.json'), JSON.stringify({
    files: {
      'hooks/lib/git-cmd.js': hash('engine'),
      'src/lib/edited.cjs': hash('original'),
      '../outside.txt': hash('x'),
    },
  }));
  write(path.join(home, 'outside.txt'), 'x');
  write(path.join(claude, 'settings.json'), JSON.stringify({
    permissions: { allow: ['Read(*)', 'Skill(gsd-quick)', 'Bash(node /h/.claude/gsd-core/bin/gsd-tools.cjs x)'] },
    statusLine: { type: 'command', command: 'node "/h/.claude/hooks/gsd-statusline.js"' },
    hooks: {
      PreToolUse: [
        { matcher: 'Read', hooks: [{ type: 'command', command: 'node "/h/.claude/hooks/gsd-read-guard.js"' }] },
        { matcher: 'Task', hooks: [{ type: 'command', command: 'node "$HOME/.claude/tron/taxis.js" claude' }] },
      ],
      SessionStart: [{ hooks: [{ type: 'command', command: 'bash "/h/.claude/hooks/gsd-session-state.sh"' }] }],
    },
  }));
  write(path.join(home, '.cursor', 'hooks.json'), JSON.stringify({
    version: 1,
    hooks: {
      preToolUse: [{ command: 'rtk hook cursor' }, { command: 'node gsd-cursor-pre-tool.js', 'gsd-managed': true }],
      stop: [{ command: 'node "/h/.cursor/hooks/gsd-cursor-stop.js"' }],
    },
  }));
  return { home, claude };
}

test('removes engine files, hooks, statusline and permissions; keeps the rest', () => {
  const { home, claude } = fakeHome();
  removeWorkflowEngine({ home });

  for (const gone of ['gsd-core', 'skills/gsd-quick', 'hooks/gsd-read-guard.js', 'hooks/lib', '.gsd-profile', 'gsd-file-manifest.json']) {
    assert.ok(!fs.existsSync(path.join(claude, gone)), `${gone} should be removed`);
  }
  assert.ok(fs.existsSync(path.join(claude, 'skills', 'deliver', 'SKILL.md')));
  assert.ok(fs.existsSync(path.join(claude, 'scripts', 'lib', 'edited.cjs')), 'edited files are kept');
  assert.ok(fs.existsSync(path.join(home, 'outside.txt')), 'paths outside the config dir are never touched');

  const settings = JSON.parse(fs.readFileSync(path.join(claude, 'settings.json'), 'utf8'));
  assert.deepStrictEqual(settings.permissions.allow, ['Read(*)']);
  assert.strictEqual(settings.statusLine, undefined);
  assert.strictEqual(settings.hooks.SessionStart, undefined);
  assert.strictEqual(settings.hooks.PreToolUse.length, 1);

  const cursor = JSON.parse(fs.readFileSync(path.join(home, '.cursor', 'hooks.json'), 'utf8'));
  assert.deepStrictEqual(cursor.hooks, { preToolUse: [{ command: 'rtk hook cursor' }] });
});

test('dry run changes nothing and is idempotent on a clean home', () => {
  const { home, claude } = fakeHome();
  const before = fs.readFileSync(path.join(claude, 'settings.json'), 'utf8');
  const logs = [];
  removeWorkflowEngine({ home, dryRun: true, log: (m) => logs.push(m) });
  assert.strictEqual(fs.readFileSync(path.join(claude, 'settings.json'), 'utf8'), before);
  assert.ok(fs.existsSync(path.join(claude, 'gsd-core')));
  assert.ok(logs.some((m) => m.startsWith('DRY:')));

  removeWorkflowEngine({ home });
  const after = [];
  removeWorkflowEngine({ home, log: (m) => after.push(m) });
  assert.deepStrictEqual(after, []);
});
