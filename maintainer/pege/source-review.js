#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { loadSources, resolveRepository } = require('./lib/sources');
const { git, mirror } = require('./lib/git');
const { reviewSource, resolveReviewEndpoint } = require('./lib/reviewer');

function groupsFor(source) {
  const groups = [];
  const add = (kind, patterns, localTarget) => groups.push({
    id: `${kind}-${String(groups.filter((group) => group.kind === kind).length + 1).padStart(3, '0')}`,
    kind, patterns, localTarget,
  });
  for (const [upstream, target] of Object.entries(source.map || {})) add('map', [upstream, `${upstream}/**`], target);
  for (const pattern of source.watch || []) add('watch', [pattern], source.local);
  for (const directory of source.discover || []) add('discovery', [directory, `${directory}/**`], source.local);
  return groups;
}

function count(raw) {
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))) throw new Error('invalid count');
  return Number(raw);
}

function delta(raw) {
  const total = { files: 0, addedLines: 0, deletedLines: 0, binaryFiles: 0 };
  for (const record of raw.split('\0').filter(Boolean)) {
    const match = /^(\d+|-)\t(\d+|-)\t[\s\S]+$/.exec(record);
    if (!match) throw new Error('invalid delta');
    total.files++;
    if (match[1] === '-' || match[2] === '-') total.binaryFiles++;
    else {
      total.addedLines += count(match[1]);
      total.deletedLines += count(match[2]);
    }
  }
  return total;
}

function inspectSource(source, { open = mirror } = {}) {
  try {
    if (!/^[a-z][a-z0-9-]*$/.test(source.id) || !/^[a-f0-9]{40}$/.test(source.ref)) throw new Error('invalid source');
    const { dir, latest } = open(source);
    if (!/^[a-f0-9]{40}$/.test(latest)) throw new Error('invalid source head');
    git(dir, 'merge-base', '--is-ancestor', source.ref, latest);
    const range = `${source.ref}..${latest}`;
    const groups = groupsFor(source).map((group) => {
      const pathspecs = group.patterns.map((pattern) => `:(glob)${pattern}`);
      return {
        id: group.id,
        kind: group.kind,
        localTarget: group.localTarget,
        commits: count(git(dir, 'rev-list', '--count', range, '--', ...pathspecs)),
        delta: delta(git(dir, 'diff', '--no-ext-diff', '--no-textconv', '--no-renames', '--numstat', '-z', source.ref, latest, '--', ...pathspecs)),
      };
    }).filter((group) => group.delta.files || group.commits);
    const tasks = groups.map((group) => ({
      id: `${source.id}/${group.id}`,
      scope: group.id,
      localTarget: group.localTarget,
      state: 'requires-private-inspection',
      action: group.kind === 'discovery' ? 'Inspect private scope for new material; decide whether a local interpretation is warranted.' : 'Inspect private scope between baseline and candidate; implement relevant behavior in the local target.',
      acceptance: [
        'Review original changes privately using the secret URL and the registry scope; do not publish original paths or text.',
        'Implement an original local interpretation and preserve required license and notice files.',
        'Run affected behavior tests and the source originality gate; record results before accepting a pin.',
        'A reviewer verifies the local port or records why no port is needed; then explicitly accepts the candidate pin.',
      ],
    }));
    return {
      id: source.id,
      baseline: source.ref,
      candidate: latest,
      commitCount: count(git(dir, 'rev-list', '--count', range)),
      state: latest === source.ref ? 'current' : groups.length ? 'review-required' : 'no-watched-changes',
      groups,
      tasks,
    };
  } catch {
    throw new Error(`${source.id}: source review failed`);
  }
}

function reviewSources(sources, { env = process.env, open = (source) => mirror(source, env) } = {}) {
  for (const source of sources) resolveRepository(source, env);
  return sources.map((source) => inspectSource(resolveScopes(source, env), { open }));
}

function resolveScopes(source, env = process.env) {
  if (!source.watchEnv) return source;
  try {
    if (!/^EXONOUS_SOURCE_\d{2}_SCOPE_JSON$/.test(source.watchEnv)) throw new Error();
    const watch = JSON.parse(env[source.watchEnv]);
    if (!Array.isArray(watch) || !watch.length || watch.length > 100 || watch.some((pattern) => typeof pattern !== 'string' || !pattern.length || pattern.length > 500 || /[\x00-\x1f]/.test(pattern))) throw new Error();
    return { ...source, watch };
  } catch {
    throw new Error(`${source.id}: missing or invalid private scope`);
  }
}

async function reviewAndPlan(sources, { env = process.env, open = (source) => mirror(source, env), request, localRoot } = {}) {
  if (!env.EXONOUS_REVIEW_API_KEY || !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,200}$/.test(env.EXONOUS_REVIEW_MODEL || '')) throw new Error('reviewer configuration unavailable');
  resolveReviewEndpoint(env);
  for (const source of sources) resolveRepository(source, env);
  const effective = sources.map((source) => resolveScopes(source, env));
  const reports = [];
  for (const source of effective) {
    const opened = open(source);
    const report = inspectSource(source, { open: () => opened });
    reports.push(await reviewSource(source, report, { ...opened, groups: groupsFor(source), env, request, localRoot }));
  }
  return reports;
}

function renderSummary(reports) {
  const lines = ['# Source review', '', 'Compiled change evidence and port preparation. Ports require private inspection and verification; pins are unchanged.', ''];
  for (const report of reports) {
    lines.push(`## ${report.id}`, '', `State: ${report.state}. Commits since baseline: ${report.commitCount}.`, '', `Baseline: \`${report.baseline}\`. Candidate: \`${report.candidate}\`.`, '');
    for (const group of report.groups) {
      lines.push(`- ${group.id} → \`${group.localTarget}\`: ${group.commits} commits, ${group.delta.files} files, +${group.delta.addedLines}/-${group.delta.deletedLines} lines, ${group.delta.binaryFiles} binary files.`);
    }
    for (const review of report.reviews || []) lines.push(`- Review ${review.scope}: ${review.decision}; reason ${review.reason}; fit ${review.localFit}; evidence ${review.evidence}; risk ${review.risk}.`);
    lines.push('', `Prepared port tasks: ${report.tasks.length}. Counts can overlap between scopes; discovery scopes require an adoption decision.`, '');
  }
  return `${lines.join('\n')}\n`;
}

async function main(argv) {
  if (argv.length !== 2 || argv[0] !== '--output' || !argv[1]) throw new Error('invalid output arguments');
  const reports = await reviewAndPlan(loadSources());
  const output = path.resolve(argv[1]);
  fs.mkdirSync(output, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(output, 'port-manifest.json'), `${JSON.stringify({ schema: 1, generatedAt: new Date().toISOString(), sources: reports }, null, 2)}\n`, { mode: 0o600 });
  fs.writeFileSync(path.join(output, 'summary.md'), renderSummary(reports), { mode: 0o600 });
  process.stdout.write(`Source review compiled: ${reports.length} symbolic sources.\n`);
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((error) => {
    const message = /^(?:reviewer configuration unavailable|[a-z][a-z0-9-]*: (?:source review failed|reviewer failed|missing or invalid private scope|missing or invalid EXONOUS_SOURCE_\d{2}_URL))$/.test(error.message) ? error.message : 'source review failed';
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { inspectSource, resolveRepository, reviewSources, renderSummary, reviewAndPlan };
