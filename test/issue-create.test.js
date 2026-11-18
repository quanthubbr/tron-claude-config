'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SKILL = path.join(__dirname, '..', 'assets', 'skills', 'issue-create');

// gh falso: registra cada chamada e responde como o gh real para os comandos que o engine usa.
const SHIM = `
const fs = require('fs');
const args = process.argv.slice(2);
const state = JSON.parse(fs.readFileSync(process.env.SHIM_STATE, 'utf8'));
fs.appendFileSync(process.env.SHIM_LOG, JSON.stringify(args) + '\\n');
const save = () => fs.writeFileSync(process.env.SHIM_STATE, JSON.stringify(state));
const cmd = args.slice(0, 2).join(' ');
const arg = (name) => args.find((a) => a.startsWith(name + '='))?.slice(name.length + 1);
if (cmd === 'issue create') { process.stdout.write('https://github.com/org/app-web/issues/42\\n'); }
else if (cmd === 'project view') { process.stdout.write('{"id":"PVT_1"}'); }
else if (cmd === 'project field-list') { process.stdout.write(JSON.stringify({ fields: state.fields })); }
else if (cmd === 'project item-add') { process.stdout.write('{"id":"PVTI_1"}'); }
else if (cmd === 'project item-edit') { process.stdout.write(''); }
else if (cmd === 'api graphql' && arg('query').startsWith('mutation')) {
  state.parents[arg('c')] = arg('p'); save(); process.stdout.write('{"data":{}}');
} else if (cmd === 'api graphql') {
  const id = 'I_' + arg('i'); const p = state.parents[id];
  process.stdout.write(JSON.stringify({ data: { repository: { issue: { id, url: 'https://github.com/org/x/issues/' + arg('i'), parent: p ? { id: p, url: 'u' } : null } } } }));
} else { process.stderr.write('unexpected ' + cmd); process.exit(9); }
`;

const FIELDS = [
  { id: 'F_STATUS', name: 'Status', options: [{ id: 'o_ready', name: 'Ready to Dev' }, { id: 'o_done', name: 'Done' }] },
  { id: 'F_PRIO', name: 'Priority', options: [{ id: 'o_p1', name: 'P1' }] },
  { id: 'F_EPIC', name: 'Épico' },
  { id: 'F_START', name: 'Start date' },
];

const REQUIRED_FIELDS = ['Status', 'Priority', 'Size', 'Área', 'Épico', 'Start date', 'End date'];
const STANDARD = {
  title: { hint: '<Área>: <sintoma>', pattern: '^[^:\\s][^:]{1,40}: \\S.{4,}$', maxLength: 100, forbidPrefix: '^(feat|fix|chore|refactor|docs)(\\([^)]*\\))?!?:' },
  templates: {
    bug: {
      typeLabel: 'bug',
      sections: [
        { name: 'Problema', required: true },
        { name: 'Onde acontece', required: true },
        { name: 'Comportamento esperado', required: true },
        { name: 'Comportamento atual', required: true },
        { name: 'Critérios de aceite', required: true, checklist: true },
      ],
    },
  },
  labels: {
    type: ['bug', 'enhancement'],
    area: { '*': ['origem:chat'], 'app-web': ['priority:high', 'priority:medium'] },
    mirror: { field: 'Priority', repos: ['app-web'], map: { P0: 'priority:high', P1: 'priority:medium' } },
  },
  requiredAssignees: ['lead'],
  project: { owner: 'org', number: 1 },
  createStatuses: ['Backlog', 'Ready to Dev'],
  requiredFields: REQUIRED_FIELDS,
};

function setup({ init = true, requiredFields = REQUIRED_FIELDS } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'issue-create-'));
  const skill = path.join(root, 'skill');
  fs.mkdirSync(skill);
  for (const file of ['create.mjs', 'config.example.json']) fs.copyFileSync(path.join(SKILL, file), path.join(skill, file));
  const standard = path.join(root, 'padrao.json');
  fs.writeFileSync(standard, JSON.stringify({ ...STANDARD, requiredFields }));
  const shim = path.join(root, 'gh.cjs');
  fs.writeFileSync(shim, SHIM);
  const env = { ...process.env, EXONOUS_TEST: '1', EXONOUS_GH_SHIM: shim, SHIM_LOG: path.join(root, 'calls.log'), SHIM_STATE: path.join(root, 'state.json') };
  fs.writeFileSync(env.SHIM_STATE, JSON.stringify({ fields: FIELDS, parents: {} }));
  const ctx = { root, skill, env, standard };
  if (init) assert.equal(run(ctx, 'init', '--from', standard).status, 0);
  return ctx;
}

function run(ctx, ...args) {
  return spawnSync(process.execPath, [path.join(ctx.skill, 'create.mjs'), ...args], { cwd: ctx.root, env: ctx.env, encoding: 'utf8' });
}

function draft(ctx, overrides = {}) {
  const value = {
    repo: 'org/app-web',
    template: 'bug',
    title: 'Order Pad: campo Total muda ao digitar a quantidade',
    sections: {
      'Critérios de aceite': '- [ ] Total fica fixo',
      Problema: 'O Total recalcula.',
      'Onde acontece': 'prod, conta 1',
      'Comportamento esperado': 'Total fixo',
      'Comportamento atual': 'Total muda',
    },
    labels: [],
    assignees: ['@me'],
    fields: {
      Status: 'Ready to Dev', Priority: 'P1', Size: 'S', 'Área': 'Order Pad',
      'Épico': 'Order Pad', 'Start date': '2026-11-17', 'End date': '2026-11-18',
    },
    ...overrides,
  };
  const file = path.join(ctx.root, `draft-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(file, JSON.stringify(value));
  return file;
}

const calls = (ctx) => (fs.existsSync(ctx.env.SHIM_LOG) ? fs.readFileSync(ctx.env.SHIM_LOG, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : []);

test('issue-create without config.json exits 3 and points to init', () => {
  const ctx = setup({ init: false });
  const result = run(ctx, 'check', draft(ctx));
  assert.equal(result.status, 3);
  assert.match(result.stderr, /issue-create init/);
});

test('issue-create init installs the team file, refuses to overwrite without --force and rejects a non-standard file', () => {
  const ctx = setup({ init: false });
  const bogus = path.join(ctx.root, 'bogus.json');
  fs.writeFileSync(bogus, '{"owner":"org"}');
  assert.equal(run(ctx, 'init', '--from', bogus).status, 3);
  assert.equal(fs.existsSync(path.join(ctx.skill, 'config.json')), false);
  assert.equal(run(ctx, 'init', '--from', ctx.standard).status, 0);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(ctx.skill, 'config.json'), 'utf8')).requiredAssignees, ['lead']);
  assert.equal(run(ctx, 'init', '--from', ctx.standard).status, 3);
  assert.equal(run(ctx, 'init', '--force').status, 0);
  assert.equal(JSON.parse(fs.readFileSync(path.join(ctx.skill, 'config.json'), 'utf8')).name, 'meu-time');
});

test('issue-create check fills type label, mirrored priority label and required assignee, body in template order', () => {
  const ctx = setup();
  const result = run(ctx, 'check', draft(ctx), '--json');
  assert.equal(result.status, 0, result.stderr);
  const issue = JSON.parse(result.stdout);
  assert.deepEqual(issue.labels, ['bug', 'priority:medium']);
  assert.deepEqual(issue.assignees, ['@me', 'lead']);
  const order = [...issue.body.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
  assert.deepEqual(order, ['Problema', 'Onde acontece', 'Comportamento esperado', 'Comportamento atual', 'Critérios de aceite']);
  assert.deepEqual(calls(ctx), []);
});

test('issue-create check lists every violation of the standard', () => {
  const ctx = setup();
  const sections = { Problema: 'x', 'Critérios de aceite': 'sem checkbox', Extra: 'y' };
  const fields = { Status: 'Done', 'Start date': '17/11/2026' };
  const result = run(ctx, 'check', draft(ctx, { title: 'fix(app): conserta.', sections, fields, labels: ['bug', 'enhancement', 'inventada'] }));
  assert.equal(result.status, 1);
  for (const expected of [
    /prefixo de commit/, /não termina com ponto/, /seção "Extra" não existe/, /seção obrigatória vazia: "Onde acontece"/,
    /"Critérios de aceite" precisa de itens/, /exatamente 1 label de tipo/, /label "inventada" fora do padrão/,
    /campo do board obrigatório vazio: "Priority"/, /"Start date" deve ser YYYY-MM-DD/, /não em "Done"/,
  ]) assert.match(result.stderr, expected);
});

test('issue-create allows a commit prefix only on a sub-issue', () => {
  const ctx = setup({ requiredFields: [] });
  const title = 'refactor(redis): ComputedStateStore com o formato atual (#823 PR 1)';
  assert.equal(run(ctx, 'check', draft(ctx, { title })).status, 1);
  assert.equal(run(ctx, 'check', draft(ctx, { title, parent: 823 })).status, 0);
});

test('issue-create create makes the issue, sets board fields by name and links the parent once', () => {
  const ctx = setup({ requiredFields: [] });
  const fields = { Status: 'Ready to Dev', Priority: 'P1', 'Épico': 'Order Pad', 'Start date': '2026-11-17' };
  const file = draft(ctx, { fields, parent: 'org/app-web#7' });
  const first = run(ctx, 'create', file, '--json');
  assert.equal(first.status, 0, first.stderr);
  assert.equal(JSON.parse(first.stdout).url, 'https://github.com/org/app-web/issues/42');

  const made = calls(ctx);
  const create = made.find((c) => c[0] === 'issue' && c[1] === 'create');
  assert.deepEqual(create.filter((_, i) => create[i - 1] === '--label'), ['bug', 'priority:medium']);
  assert.ok(create.includes('lead'));
  const edits = made.filter((c) => c[1] === 'item-edit').map((c) => c.slice(c.indexOf('--field-id') + 1));
  assert.deepEqual(edits, [
    ['F_STATUS', '--single-select-option-id', 'o_ready'],
    ['F_PRIO', '--single-select-option-id', 'o_p1'],
    ['F_EPIC', '--text', 'Order Pad'],
    ['F_START', '--date', '2026-11-17'],
  ]);
  const mutations = () => calls(ctx).filter((c) => c.some((a) => a.startsWith('query=mutation'))).length;
  assert.equal(mutations(), 1);

  const again = run(ctx, 'create', file, '--issue', 'https://github.com/org/app-web/issues/42');
  assert.equal(again.status, 0, again.stderr);
  assert.match(again.stdout, /já era sub-issue/);
  assert.equal(mutations(), 1);
  assert.equal(calls(ctx).filter((c) => c[0] === 'issue' && c[1] === 'create').length, 1);
});

test('issue-create create refuses an option the board does not have before creating anything', () => {
  const ctx = setup({ requiredFields: [] });
  const result = run(ctx, 'create', draft(ctx, { fields: { Priority: 'P9' } }));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /"P9" não é opção de "Priority"/);
  assert.equal(calls(ctx).filter((c) => c[1] === 'create' || c[1] === 'item-add').length, 0);
});

test('issue-create create prints the resume command when a step after creation fails', () => {
  const ctx = setup({ requiredFields: [] });
  const state = JSON.parse(fs.readFileSync(ctx.env.SHIM_STATE, 'utf8'));
  state.parents.I_42 = 'I_OTHER';
  fs.writeFileSync(ctx.env.SHIM_STATE, JSON.stringify(state));
  const result = run(ctx, 'create', draft(ctx, { fields: {}, parent: 7 }));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /já é sub-issue de/);
  assert.match(result.stderr, /--issue https:\/\/github.com\/org\/app-web\/issues\/42/);
});

test('issue-create create --dry-run never calls gh', () => {
  const ctx = setup({ requiredFields: [] });
  const result = run(ctx, 'create', draft(ctx), '--dry-run');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).title, 'Order Pad: campo Total muda ao digitar a quantidade');
  assert.deepEqual(calls(ctx), []);
});

test('issue-create rejects an invalid title regex in the standard with exit 3', () => {
  const ctx = setup();
  const config = path.join(ctx.skill, 'config.json');
  fs.writeFileSync(config, JSON.stringify({ ...JSON.parse(fs.readFileSync(config, 'utf8')), title: { pattern: '(' } }));
  const result = run(ctx, 'check', draft(ctx));
  assert.equal(result.status, 3);
  assert.match(result.stderr, /title\.pattern inválido/);
});
