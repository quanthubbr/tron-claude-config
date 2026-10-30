#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const USAGE = `exonous — the mind outside your head, for coding agents

Usage: exonous <command> [flags]

  install       wire every detected tool (Claude Code, Cursor, Gemini, Codex, OpenCode); safe to re-run
                --dry-run  --quiet  --permissions  --tools a,b  --all  --skip-tool x  --rewrite-jsonc
  update        move to the latest release of this major   --check: report only  --major: cross a major
  doctor        check every piece and say how to fix what is missing
  uninstall     remove exonous from this machine            --yes  --dry-run  --verbose  --remove-package
  migrate       move a repo-mode (v2.0.0 or older) install of this repo to the machine install   --repo <dir>
  doctor/gate   exonous gate --selftest <tool>: pipe a fake git commit to the registered hook, expect a deny

  token <commit|push>    after review: allow one commit of the staged tree, or one push of HEAD (15 min)
  workflow <commit|pr>   print the commit or PR procedure
  template               print the PR template that applies here
  draft-path             print where to write this repo's PR body draft
  validate-pr <file>     check a PR body against the template

  setup is an alias of install. From a source checkout, install/uninstall need EXONOUS_HOME or --real-home.`;

function flag(name) {
  return process.argv.includes(`--${name}`);
}

function value(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? null : process.argv[i + 1] || null;
}

const list = (name) => (value(name) ? value(name).split(',').map((s) => s.trim()).filter(Boolean) : null);
const arg = (i) => process.argv[3 + i];
const hooksLib = (name) => require(path.join(__dirname, '..', 'assets', 'machine', 'hooks', 'lib', name));

// A copy inside a repo's node_modules is a repo-mode install (the v2.0.0 updater runs `setup` there): migrate it.
function runRepoMigration(root, trigger = 'cli') {
  const result = require('../src/legacy/repo-migrate').migrateRepo({ root, trigger });
  if (result.status === 'nothing') console.log(`[exonous] no repo-mode install found in ${root}`);
  return ['blocked', 'refused'].includes(result.status) ? 1 : 0;
}

function runInstall() {
  if (process.argv[2] === 'setup' && require('../src/lib/runtime').setupDecision() === 'migrate') {
    return runRepoMigration(require('../src/legacy/repo-migrate').migrationRoot(path.join(__dirname, '..')), 'repo');
  }
  require('../src/install').install({
    dryRun: flag('dry-run'), quiet: flag('quiet'), permissions: flag('permissions'), tools: list('tools'), all: flag('all'),
    skip: list('skip-tool') || [], realHome: flag('real-home'), rewriteJsonc: flag('rewrite-jsonc'),
  });
  return 0;
}

function runGate() {
  const id = value('selftest');
  const { ADAPTERS, selftest } = require('../src/adapters');
  const adapter = ADAPTERS.find((a) => a.id === id);
  if (!adapter) {
    console.error(`usage: exonous gate --selftest <${ADAPTERS.map((a) => a.id).join('|')}>`);
    return 2;
  }
  const result = selftest(adapter);
  console.log(`${id}: ${result.detail}`);
  return result.ok ? 0 : 1;
}

function runToken() {
  const kind = arg(0);
  const token = hooksLib('token.cjs');
  if (!token.KINDS.includes(kind)) {
    console.error(`usage: exonous token <${token.KINDS.join('|')}>`);
    return 2;
  }
  const minted = token.mint(kind, process.cwd());
  const what = kind === 'commit' ? 'one commit of the staged tree' : 'one push of HEAD';
  console.log(`${kind} token minted: allows ${what} (${minted.sha.slice(0, 12)}), expires ${new Date(minted.exp).toLocaleTimeString()}.`);
  return 0;
}

function runTemplate() {
  const { resolveTemplate } = hooksLib('template.cjs');
  const template = resolveTemplate(process.cwd());
  if (!template.path) {
    console.error('no PR template found');
    return 1;
  }
  console.log(`${template.path}
`);
  process.stdout.write(fs.readFileSync(template.path, 'utf8'));
  return 0;
}

function runDraftPath() {
  require('../src/lib/runtime').assertOwner('write a PR draft');
  const file = hooksLib('template.cjs').draftPath(process.cwd());
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  console.log(file);
  return 0;
}

function runValidatePr() {
  const file = arg(0);
  if (!file) {
    console.error('usage: exonous validate-pr <file>');
    return 2;
  }
  const { resolveTemplate } = hooksLib('template.cjs');
  const template = resolveTemplate(process.cwd());
  const result = hooksLib('pr-template-validate.cjs').validateBodyFile(file, process.cwd(), template);
  if (!result.ok) {
    console.error(result.reason);
    return 1;
  }
  console.log(`PR body OK — all ${template.sections.length} template titles present (${template.path}).`);
  return 0;
}

function runUpdate() {
  const { update, describe } = require('../src/update');
  const options = { check: flag('check'), background: flag('background'), major: flag('major') };
  let result;
  try {
    if (!options.check && !options.background) require('../src/lib/runtime').assertOwner('update');
    result = update(options);
  } catch (err) {
    if (options.background) return 0;
    console.error(`exonous update: ${err.message.split('\n')[0]}`);
    return 1;
  }
  if (options.background) return 0;
  const message = describe(result, options);
  if (['failed', 'error', 'not-owner'].includes(result.status)) {
    console.error(message);
    return 1;
  }
  console.log(message);
  return 0;
}

const commands = {
  install: runInstall,
  setup: runInstall,
  update: runUpdate,
  doctor: () => require('../src/doctor').doctor(),
  uninstall: () => require('../src/uninstall').uninstall({ yes: flag('yes'), dryRun: flag('dry-run'), realHome: flag('real-home'), verbose: flag('verbose'), removePackage: flag('remove-package') }),
  gate: runGate,
  migrate: () => runRepoMigration(path.resolve(value('repo') || process.cwd())),
  token: runToken,
  workflow: () => {
    require('../src/workflow').workflow(arg(0));
    return 0;
  },
  template: runTemplate,
  'draft-path': runDraftPath,
  'validate-pr': runValidatePr,
};

const command = process.argv[2];
if (!commands[command]) {
  console.log(USAGE);
  process.exit(command && !['help', '--help', '-h'].includes(command) ? 2 : 0);
}
Promise.resolve().then(() => commands[command]())
  .then((code) => process.exit(typeof code === 'number' ? code : 0))
  .catch((err) => {
    console.error(`exonous ${command}: ${err.message}`);
    process.exit(1);
  });
