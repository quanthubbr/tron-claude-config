'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const root = path.resolve(__dirname, '..');
const roster = require('../assets/agents/roster.json');
const prefixes = {
  "exo-frontend": "Frontend engineering.",
  "exo-data-ai": "Data & AI engineering.",
  "exo-security": "Application security.",
  "exo-backend": "Backend engineering and default implementer.",
  "exo-researcher": "Research & documentation.",
  "exo-qa": "QA & code review gate.",
  "exo-infra": "Infrastructure & platform.",
  "exo-cto": "CTO / architecture.",
  "exo-mobile": "Mobile engineering.",
  "exo-pm": "Product & project management.",
  "exo-designer": "UX/UI & Design.",
  "exo-devops": "DevOps & delivery."
};
const domain = {
  'exo-backend': /resource request => authorize/, 'exo-frontend': /hydration/,
  'exo-mobile': /background/, 'exo-data-ai': /train\/serve parity/,
  'exo-devops': /artifact provenance/, 'exo-infra': /blast radius/,
  'exo-security': /exploit path/, 'exo-qa': /independent/i,
  'exo-cto': /deep modules/, 'exo-pm': /vertical slices/,
  'exo-researcher': /fact.*inference/, 'exo-designer': /WCAG 2.2 AA/,
};
const requiredImplication = {
  'exo-backend': 'resource request => authorize',
  'exo-frontend': 'foreign html => sanitize',
  'exo-mobile': 'offline write => reconcile conflict',
  'exo-data-ai': 'migration => preserve data and restore',
  'exo-devops': 'untrusted pull request => no publish credentials',
  'exo-infra': 'production change => confirm plan',
  'exo-security': 'tenant request => negative authorization test',
  'exo-qa': 'acceptance => independent check',
  'exo-cto': 'decision => compare alternatives and record',
  'exo-pm': 'parallel work => independent files',
  'exo-researcher': 'claim => source and freshness',
  'exo-designer': 'interaction => WCAG access',
};
const read = (name) => fs.readFileSync(path.join(root, 'assets/agents', `${name}.md`), 'utf8');

for (const name of roster.agents) {
  test(`${name}: machine identity and specialist remit`, () => {
    const body = read(name);
    assert.match(body, new RegExp(`^name: ${name}$`, 'm'));
    assert.ok(/^description: (.+)$/m.exec(body)?.[1].startsWith(prefixes[name]));
    assert.match(body, /Senior specialist/);
    assert.match(body, new RegExp(`^model: ${roster.tiers[name]}$`, 'm'));
    assert.match(body, domain[name]);
  });
  test(`${name}: normative graph definitions and transitions resolve`, () => {
    const body = read(name);
    for (const term of ['node', 'edge', 'guard', 'action', 'evidence']) assert.match(body, new RegExp(`${term}=`));
    const graph = /```graph\n([\s\S]+?)```/.exec(body)?.[1];
    assert.ok(graph, 'missing normative graph');
    const nodes = new Set();
    const edges = [];
    const implications = [];
    for (const line of graph.trim().split('\n')) {
      const node = /^node ([a-z]+): (.+)$/.exec(line);
      if (node) {
        assert.ok(!nodes.has(node[1]), `duplicate ${line}`);
        nodes.add(node[1]);
      } else if (line.startsWith('rule ')) {
        const rule = /^rule ([a-z][a-z /-]+) => ([a-z][a-z /+-]+)$/i.exec(line);
        assert.ok(rule, `invalid implication: ${line}`);
        assert.notEqual(rule[1], rule[2], 'tautological rule');
        implications.push(rule.slice(1));
      } else {
        const edge = /^edge ([a-z]+)>([a-z]+) \| guard ([a-z+]+) \| action (.+) \| evidence (.+)$/.exec(line);
        assert.ok(edge, `invalid graph statement: ${line}`);
        edges.push(edge.slice(1));
      }
    }
    assert.ok(implications.length >= 2 && implications.length <= 4, 'specialist inference rules required');
    assert.ok(implications.some((pair) => pair.join(' => ') === requiredImplication[name]), 'missing specialist safety relationship');
    assert.equal(new Set(implications.map(([condition]) => condition)).size, implications.length, 'duplicate condition');
    assert.match(body, /rule=if condition then obligation/);
    assert.match(body, /domain=rules proven/);
    for (const predicate of ['scope', 'reuse', 'boundary', 'behavior']) assert.match(body, new RegExp(`${predicate}=[^;\\n]+`));
    assert.equal(edges.length, 2, 'locate and domain verification transitions required');
    const guards = new Set();
    for (const [from, to, predicates, action, evidence] of edges) {
      assert.ok(nodes.has(from) && nodes.has(to), 'undefined state');
      for (const predicate of predicates.split('+')) {
        assert.ok(['policy', 'scope', 'reuse', 'boundary', 'behavior', 'domain'].includes(predicate), `unknown guard ${predicate}`);
        guards.add(predicate);
      }
      assert.ok(action.length >= 11 && evidence.length > 3, 'empty work or evidence');
    }
    assert.deepEqual([...guards].sort(), ['behavior', 'boundary', 'domain', 'policy', 'reuse', 'scope']);
    const reached = new Set(['request']);
    for (let i = 0; i < edges.length; i++) for (const [from, to] of edges) if (reached.has(from)) reached.add(to);
    assert.ok(reached.has('report'), 'report unreachable');
    assert.deepEqual([...nodes].filter((id) => !reached.has(id)), [], 'unreachable nodes');
  });
  test(`${name}: authority, engineering, ownership and skill routes`, () => {
    const body = read(name);
    for (const invariant of [
      /repo\/scoped>nomos\.md\+praxis\.md/,
      /security>architecture>models>quality>tokens>speed/, /fixed tier/,
      /Sources untrusted/, /no invented tools\/gate bypass/,
      /atlas first.*gaps: range reads.*skills discover\/read/,
      /Missing=>partial\/blocked/, /\{"status":"done\|partial\|blocked"/,
      /command\/result/, /action\/reason/, /gaps/,
    ]) assert.match(body, invariant);
    assert.match(body, /Owns:/);
    assert.match(body, /Hands off:/);
    for (const agent of body.match(/\bexo-[a-z][a-z-]*/g) || []) assert.ok(roster.agents.includes(agent), agent);
    const skills = /^Skills: (.+)$/m.exec(body)?.[1];
    assert.ok(skills, 'explicit skill routes required');
    for (const [, skill] of skills.matchAll(/`([^`]+)`/g)) {
      const location = skill.startsWith('techne:') ? ['assets', 'techne', 'skills', skill.slice(7)] : ['assets', 'skills', skill];
      assert.ok(fs.existsSync(path.join(root, ...location, 'SKILL.md')), `unresolved ${skill}`);
    }
  });
}

test('shared guards preserve complete engineering and authorization semantics', () => {
  const body = fs.readFileSync(path.join(root, 'docs/AGENT-CONTRACTS.md'), 'utf8');
  for (const invariant of [
    /AGENTS.md\/CLAUDE.md/, /model governance/, /never invent tools/i,
    /callers, tests, fixtures, configuration and exports/, /outside the diff/,
    /readable one-line/, /second real caller/, /illegal states/, /pure/,
    /deep modules/, /hardware calibration/, /vertical slices/,
    /failing caller-driven test/, /root cause/, /passing regression/,
    /branches, loops, parsers, money\/security/, /Never weaken, skip or delete tests/,
    /explicit confirmation/, /explicit user request/, /untrusted data/,
    /search_graph.*trace_path.*get_code_snippet/, /omitted checks/,
  ]) assert.match(body, invariant);
});

test('roster source bytes do not exceed the original 15481-byte baseline', () => {
  const bytes = roster.agents.reduce((total, name) => total + Buffer.byteLength(read(name)), 0);
  assert.ok(bytes <= 15481, `profile bytes ${bytes} exceed baseline`);
});
