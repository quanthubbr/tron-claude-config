'use strict';

require('./helpers/tmp-cleanup');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { inspectSource, resolveRepository, reviewSources, renderSummary, reviewAndPlan } = require('../maintainer/pege/source-review');
const { validateProfile, startVpn, stopVpn, probeGateway } = require('../maintainer/pege/vpn');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'source-review-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '--quiet');
  git('config', 'user.name', 'Fixture');
  git('config', 'user.email', 'fixture@example.invalid');
  fs.mkdirSync(path.join(dir, 'private-engine'));
  fs.writeFileSync(path.join(dir, 'private-engine', 'PRIVATE-BRAND.md'), 'old\n');
  git('add', '.');
  git('commit', '--quiet', '-m', 'private original');
  const pinned = git('rev-parse', 'HEAD');
  fs.writeFileSync(path.join(dir, 'private-engine', 'PRIVATE-BRAND.md'), 'new\nline\n');
  fs.writeFileSync(path.join(dir, 'unwatched'), 'unrelated\n');
  git('add', '.');
  git('commit', '--quiet', '-m', 'PRIVATE-BRAND https://secret.invalid/private');
  const latest = git('rev-parse', 'HEAD');
  const source = { id: 'fixture', repoEnv: 'EXONOUS_SOURCE_01_URL', ref: pinned, license: 'MIT', local: 'assets/local/', map: { 'private-engine': 'local/reference.md' }, watch: [], discover: [] };
  return { dir, latest, source, git };
}

test('compiles real changed paths into symbolic port tasks without upstream content', (t) => {
  const { dir, latest, source } = fixture(t);
  const report = inspectSource(source, { open: () => ({ dir, latest }) });
  assert.equal(report.commitCount, 1);
  assert.equal(report.groups.length, 1);
  assert.deepEqual(report.groups[0].delta, { files: 1, addedLines: 2, deletedLines: 1, binaryFiles: 0 });
  assert.equal(report.groups[0].commits, 1);
  assert.equal(report.groups[0].id, 'map-001');
  assert.equal(report.tasks[0].localTarget, 'local/reference.md');
  assert.ok(report.tasks[0].acceptance.length >= 3);
  assert.equal(report.tasks[0].state, 'requires-private-inspection');
  const published = JSON.stringify(report) + renderSummary([report]);
  assert.doesNotMatch(published, /PRIVATE-BRAND|private-engine|secret\.invalid|private original/);
});

test('unchanged baseline produces no port tasks', (t) => {
  const { dir, source } = fixture(t);
  const report = inspectSource(source, { open: () => ({ dir, latest: source.ref }) });
  assert.equal(report.commitCount, 0);
  assert.equal(report.tasks.length, 0);
});

test('missing and malformed secrets fail closed without exposing values', () => {
  const source = { id: 'fixture', repoEnv: 'EXONOUS_SOURCE_01_URL' };
  for (const value of [undefined, 'http://github.com/owner/repo', 'https://user:password@github.com/owner/repo', 'https://github.com/owner/repo?private=secret', 'https://github.com.evil.invalid/owner/repo', 'https://github.com:443/owner/repo', 'https://github.com/owner/repo\n']) {
    assert.throws(() => resolveRepository(source, { EXONOUS_SOURCE_01_URL: value }), (error) => {
      assert.equal(error.message, 'fixture: missing or invalid EXONOUS_SOURCE_01_URL');
      return true;
    });
  }
  assert.equal(resolveRepository(source, { EXONOUS_SOURCE_01_URL: 'https://github.com/owner/repo.git' }), 'https://github.com/owner/repo.git');
});

test('all secrets are validated before opening any upstream', () => {
  let opened = false;
  assert.throws(() => reviewSources([{ id: 'fixture', repoEnv: 'EXONOUS_SOURCE_01_URL' }], { env: {}, open: () => { opened = true; } }), /missing or invalid/);
  assert.equal(opened, false);
});

test('subprocess errors and malformed output never become published context', (t) => {
  const { source } = fixture(t);
  for (const open of [() => { throw new Error('https://private.invalid PRIVATE-BRAND secret'); }, () => ({ dir: '/missing/PRIVATE-BRAND', latest: 'PRIVATE-BRAND' })]) {
    assert.throws(() => inspectSource(source, { open }), (error) => {
      assert.equal(error.message, 'fixture: source review failed');
      return true;
    });
  }
});

test('rewritten history fails closed and leaves the pin untouched', (t) => {
  const { dir, latest, source } = fixture(t);
  const before = source.ref;
  assert.throws(() => inspectSource({ ...source, ref: latest }, { open: () => ({ dir, latest: before }) }), /fixture: source review failed/);
  assert.equal(source.ref, before);
});

test('registry uses fifteen secret names and workflow publishes only compiled files', () => {
  const registry = JSON.parse(fs.readFileSync(path.join(__dirname, '../maintainer/pege/sources.json'), 'utf8'));
  assert.equal(registry.sources.length, 15);
  registry.sources.forEach((source, i) => {
    assert.equal(source.repo, undefined);
    assert.equal(source.repoEnv, `EXONOUS_SOURCE_${String(i + 1).padStart(2, '0')}_URL`);
  });
  const workflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/source-review.yml'), 'utf8');
  assert.match(workflow, /cron: '0 6 \* \* 1'/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /contents: read/);
  assert.doesNotMatch(workflow, /pull_request:|contents: write|vars\.EXONOUS_SOURCE|vars\.EXONOUS_REVIEW_(?:BASE_URL|API_KEY|MODEL)|pege\/\.cache|git push/);
  assert.match(workflow, /runs-on: ubuntu-latest/);
  assert.match(workflow, /secrets\.CLAUDE_CODE_OAUTH_TOKEN/);
  assert.match(workflow, /EXONOUS_REVIEW_BACKEND: claude/);
  assert.match(workflow, /@anthropic-ai\/claude-code@2\.1\.318/);
  assert.doesNotMatch(workflow, /EXONOUS_REVIEW_(?:VPN|BASE_URL|API_KEY)|pege\/vpn\.js/);
  assert.doesNotMatch(workflow, /uses: actions\/[\w-]+@v\d/);
  for (const source of registry.sources) assert.ok(workflow.includes(`secrets.${source.repoEnv}`));
  const ci = fs.readFileSync(path.join(__dirname, '../.github/workflows/ci.yml'), 'utf8');
  const release = ci.split('  release-checks:')[1].split('\n  release:')[0];
  assert.match(release, /github.event_name == 'push' && github.ref == 'refs\/heads\/main'/);
  for (const source of registry.sources) assert.ok(release.includes(`secrets.${source.repoEnv}`));
  assert.doesNotMatch(ci.split('  release-checks:')[0], /secrets\.EXONOUS_SOURCE/);
});

test('reviewer sees private change and local implementation but publishes only validated decision codes', async (t) => {
  const { dir, latest, source } = fixture(t);
  const localRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'source-local-'));
  t.after(() => fs.rmSync(localRoot, { recursive: true, force: true }));
  fs.mkdirSync(path.join(localRoot, 'local'));
  fs.writeFileSync(path.join(localRoot, 'local/reference.md'), 'Our intentionally simplified local behavior.\n');
  let sent;
  const request = async (url, options) => {
    assert.equal(url, 'https://gateway.invalid/v1/responses');
    assert.equal(options.redirect, 'error');
    sent = JSON.parse(options.body);
    assert.equal(sent.store, false);
    assert.deepEqual(sent.tools, []);
    assert.match(sent.input[1].content, /PRIVATE-BRAND/);
    assert.match(sent.input[1].content, /intentionally simplified/);
    return { ok: true, json: async () => ({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ decisions: [{ scope: 'map-001', decision: 'adopt', reason: 'compatibility-fix', localFit: 'existing-responsibility', evidence: 'behavior-change', risk: 'low', steps: ['add-regression-test', 'implement-minimal-local-change', 'run-affected-checks'] }] }) }] }] }) };
  };
  const reports = await reviewAndPlan([source], { env: { EXONOUS_SOURCE_01_URL: 'https://github.com/owner/repo', EXONOUS_REVIEW_API_KEY: 'private-api-key', EXONOUS_REVIEW_MODEL: 'cx/review-model', EXONOUS_REVIEW_BASE_URL: 'https://gateway.invalid/v1/' }, open: () => ({ dir, latest }), request, localRoot });
  assert.equal(sent.text.format.strict, true);
  assert.equal(reports[0].reviews[0].decision, 'adopt');
  assert.equal(reports[0].tasks[0].steps[1], 'implement-minimal-local-change');
  assert.doesNotMatch(JSON.stringify(reports), /PRIVATE-BRAND|private-api-key|private-engine|intentionally simplified/);
});

test('review fails closed for missing credentials, refusals, unknown scopes, or model text leakage', async (t) => {
  const { dir, latest, source } = fixture(t);
  const options = { env: { EXONOUS_SOURCE_01_URL: 'https://github.com/owner/repo', EXONOUS_REVIEW_API_KEY: 'private-api-key', EXONOUS_REVIEW_MODEL: 'cx/review-model', EXONOUS_REVIEW_BASE_URL: 'https://gateway.invalid/v1/' }, open: () => ({ dir, latest }) };
  await assert.rejects(reviewAndPlan([source], { ...options, env: {} }), /reviewer configuration unavailable/);
  for (const response of [
    { status: 'incomplete', output: [] },
    { status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'PRIVATE-BRAND' }] }] },
    { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '{"decisions":[{"scope":"map-999","decision":"adopt"}]}' }] }] },
    { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '{"decisions":[],"leak":"https://private.invalid"}' }] }] },
  ]) {
    const request = async () => ({ ok: true, json: async () => response });
    await assert.rejects(reviewAndPlan([source], { ...options, request }), (error) => {
      assert.equal(error.message, 'fixture: reviewer failed');
      return true;
    });
  }
});

test('defer and reject preserve decisions without creating implementation plans', async (t) => {
  const { dir, latest, source } = fixture(t);
  for (const decision of ['defer', 'reject']) {
    const request = async () => ({ ok: true, json: async () => ({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ decisions: [{ scope: 'map-001', decision, reason: 'already-covered', localFit: 'no-local-benefit', evidence: 'documentation-change', risk: 'low', steps: [] }] }) }] }] }) });
    const [report] = await reviewAndPlan([source], { env: { EXONOUS_SOURCE_01_URL: 'https://github.com/owner/repo', EXONOUS_REVIEW_API_KEY: 'private-api-key', EXONOUS_REVIEW_MODEL: 'cx/review-model', EXONOUS_REVIEW_BASE_URL: 'https://gateway.invalid/v1/' }, open: () => ({ dir, latest }), request });
    assert.equal(report.reviews[0].decision, decision);
    assert.equal(report.tasks.length, 0);
    assert.match(renderSummary([report]), new RegExp(`Review map-001: ${decision}`));
  }
});

test('binary files and unusual source names remain aggregated without being published', (t) => {
  const { dir, source, git } = fixture(t);
  const inputGit = (input, ...args) => execFileSync('git', args, { cwd: dir, input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  const binary = inputGit(Buffer.from([0, 1, 2]), 'hash-object', '-w', '--stdin');
  const text = git('rev-parse', 'HEAD:private-engine/PRIVATE-BRAND.md');
  const subtree = inputGit(`100644 blob ${text}\tPRIVATE-BRAND.md\0` + `100644 blob ${binary}\tPRIVATE-BRAND\nfile.bin\0`, 'mktree', '-z');
  const tree = inputGit(`040000 tree ${subtree}\tprivate-engine\0`, 'mktree', '-z');
  const latest = git('commit-tree', tree, '-p', git('rev-parse', 'HEAD'), '-m', 'private binary');
  const report = inspectSource(source, { open: () => ({ dir, latest }) });
  assert.equal(report.groups[0].delta.files, 2);
  assert.equal(report.groups[0].delta.binaryFiles, 1);
  assert.doesNotMatch(JSON.stringify(report), /PRIVATE-BRAND|file\.bin|private-engine/);
});

test('invalid reviewer base URL prevents fetching or opening sources', async () => {
  for (const base of [undefined, 'http://gateway.invalid/v1', 'https:gateway.invalid/v1', 'https:///gateway.invalid/v1', 'https://@gateway.invalid/v1', 'https://user:password@gateway.invalid/v1', 'https://gateway.invalid/v1?private=secret', 'https://gateway.invalid/v1#secret', 'https://gateway.invalid/v1\n', 'https://gateway.invalid/v1/responses']) {
    let touched = false;
    await assert.rejects(reviewAndPlan([], { env: { EXONOUS_REVIEW_API_KEY: 'private-api-key', EXONOUS_REVIEW_MODEL: 'cx/review-model', EXONOUS_REVIEW_BASE_URL: base }, open: () => { touched = true; }, request: async () => { touched = true; } }), /reviewer configuration unavailable/);
    assert.equal(touched, false);
  }
});

test('VPN profile rejects executable hooks, includes and credential paths', () => {
  assert.equal(validateProfile('client\ndev tun\nremote gateway.invalid 443\n<ca>\nprivate certificate\n</ca>\n'), false);
  for (const directive of ['up /private/script', 'plugin /private/library', 'config /private/profile', 'auth-user-pass /private/credentials', 'log /private/output', 'script-security 2']) {
    assert.throws(() => validateProfile(`client\n${directive}\n`), /VPN configuration unavailable/);
  }
});

test('VPN accepts safe operational directives used by the existing client profile', () => {
  const profile = ['client', 'auth SHA256', 'connect-retry-max 3', 'data-ciphers AES-256-GCM', 'dev tun', 'dev-type tun', 'disable-dco', 'hand-window 60', 'ignore-unknown-option data-ciphers disable-dco', 'key-direction 1', 'mute 20', 'nobind', 'persist-tun', 'ping 10', 'ping-exit 60', 'pull-filter ignore redirect-gateway', 'push-peer-info', 'rcvbuf 0', 'remap-usr1 SIGTERM', 'remote gateway.invalid 443 tcp-client', 'remote-cert-tls server', 'reneg-sec 0', 'server-poll-timeout 10', 'setenv UV_ID fixture', 'setenv opt block-outside-dns', 'sndbuf 0', 'tun-mtu 1500', 'verb 1'].join('\n');
  assert.equal(validateProfile(profile), false);
  for (const line of ['ignore-unknown-option plugin', 'setenv opt up /private/script', 'remap-usr1 unexpected']) assert.throws(() => validateProfile(`client\n${line}\n`), /VPN configuration unavailable/);
});

test('VPN uses private temp files, probes before success and stops only its own process', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'source-vpn-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  let own;
  const commands = [];
  const run = (args) => {
    commands.push(args);
    if (args[1] === 'openvpn') {
      const profile = args[args.indexOf('--config') + 1];
      own = path.dirname(profile);
      fs.writeFileSync(path.join(own, 'pid'), '12345');
      fs.writeFileSync(path.join(own, 'vpn.log'), 'Initialization Sequence Completed\n');
    }
  };
  let probes = 0;
  await startVpn({ env: { RUNNER_TEMP: dir, EXONOUS_REVIEW_VPN_PROFILE: 'client\ndev tun\nremote gateway.invalid 443\n', EXONOUS_REVIEW_BASE_URL: 'https://gateway.invalid/v1' }, run, probe: async () => { probes++; return true; }, delay: async () => {} });
  assert.equal(fs.statSync(path.join(own, 'client.ovpn')).mode & 0o777, process.platform === 'win32' ? 0o666 : 0o600);
  assert.equal(fs.statSync(own).mode & 0o777, process.platform === 'win32' ? 0o666 : 0o700);
  assert.equal(fs.readFileSync(path.join(own, 'client.ovpn'), 'utf8'), 'client\ndev tun\nremote gateway.invalid 443\n');
  assert.equal(probes, 1);
  assert.ok(commands[0].includes('--script-security'));
  await stopVpn({ env: { RUNNER_TEMP: dir }, run, processArgs: () => ['openvpn', '--config', path.join(own, 'client.ovpn'), '--writepid', path.join(own, 'pid')], delay: async () => {} });
  assert.deepEqual(commands[1], ['-n', 'kill', '-TERM', '12345']);
  assert.ok(!fs.existsSync(own));
  assert.doesNotMatch(JSON.stringify(commands), /private certificate|EXONOUS_REVIEW/);
});

test('VPN probe is anonymous, bounded and rejects redirects or unreachable gateway', async () => {
  let calls = 0;
  const probe = (status) => async (url, options) => {
    calls++;
    assert.equal(url, 'https://gateway.invalid/v1/models');
    assert.equal(options.headers, undefined);
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
    return { ok: status === 200, status, body: null };
  };
  for (const status of [200, 401]) assert.equal(await probeGateway('https://gateway.invalid/v1/', probe(status)), true);
  for (const status of [302, 403, 500]) assert.equal(await probeGateway('https://gateway.invalid/v1/', probe(status)), false);
  assert.equal(await probeGateway('https://gateway.invalid/v1/', async () => { throw new Error('private network location'); }), false);
  assert.equal(calls, 5);
});

test('VPN failures identify a safe stage without publishing private log content', async (t) => {
  for (const [log, stage] of [
    ['AUTH_FAILED private-user', 'authentication rejected'],
    ['VERIFY ERROR: private-certificate', 'certificate verification failed'],
    ['TLS Error: private-host', 'TLS negotiation failed'],
    ['Options error: private-profile', 'client configuration rejected'],
    ['Exiting due to fatal error: private-path', 'client exited'],
    ['private-host waiting', 'tunnel initialization timed out'],
    ['Initialization Sequence Completed', 'gateway probe timed out']
  ]) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'source-vpn-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    let probes = 0;
    const run = (args) => fs.writeFileSync(args[args.indexOf('--log') + 1], log);
    await assert.rejects(startVpn({
      env: { RUNNER_TEMP: dir, EXONOUS_REVIEW_VPN_PROFILE: 'client\ndev tun\n', EXONOUS_REVIEW_BASE_URL: 'https://gateway.invalid/v1' },
      run, probe: async () => { probes++; return false; }, delay: async () => {}
    }), { message: `VPN connection unavailable (${stage})` });
    assert.equal(probes, stage === 'gateway probe timed out' ? 12 : 0);
  }
});

test('VPN launch and cleanup errors suppress subprocess output but preserve the stage', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'source-vpn-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const env = { RUNNER_TEMP: dir, EXONOUS_REVIEW_VPN_PROFILE: 'client\ndev tun\n', EXONOUS_REVIEW_BASE_URL: 'https://gateway.invalid/v1' };
  await assert.rejects(startVpn({ env, run: () => { throw new Error('private subprocess output'); } }), { message: 'VPN connection unavailable (client launch)' });
  const own = fs.readFileSync(path.join(dir, 'source-review-vpn-state'), 'utf8');
  fs.writeFileSync(path.join(own, 'pid'), '12345');
  await assert.rejects(stopVpn({ env, processArgs: () => ['openvpn', path.join(own, 'client.ovpn'), path.join(own, 'pid')], run: () => { throw new Error('private subprocess output'); } }), { message: 'VPN cleanup failed (process termination)' });
});

test('VPN CLI prints sanitized diagnostics and exits unsuccessfully', () => {
  assert.throws(() => execFileSync(process.execPath, [path.join(__dirname, '../maintainer/pege/vpn.js'), 'start'], {
    env: { ...process.env, EXONOUS_REVIEW_VPN_PROFILE: 'private-invalid-directive' }, stdio: ['ignore', 'pipe', 'pipe']
  }), (error) => {
    assert.equal(error.status, 1);
    assert.equal(error.stderr.toString(), 'VPN connection unavailable (configuration validation)\n');
    return true;
  });
});

test('VPN cleanup never signals a reused PID belonging to another command', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'source-vpn-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const vpn = fs.mkdtempSync(path.join(dir, 'source-review-vpn-'));
  fs.writeFileSync(path.join(dir, 'source-review-vpn-state'), vpn);
  fs.writeFileSync(path.join(vpn, 'pid'), '12345');
  let signaled = false;
  await stopVpn({ env: { RUNNER_TEMP: dir }, run: () => { signaled = true; }, processArgs: () => ['unrelated-process'] });
  assert.equal(signaled, false);
  assert.ok(!fs.existsSync(vpn));
});

function claudeFixture(t, behavior = '') {
  const fixtureData = fixture(t);
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'source-claude-bin-'));
  t.after(() => fs.rmSync(bin, { recursive: true, force: true }));
  const capture = path.join(bin, 'capture.json');
  const decision = { decisions: [{ scope: 'map-001', decision: 'defer', reason: 'insufficient-evidence', localFit: 'uncertain', evidence: 'insufficient-context', risk: 'low', steps: [] }] };
  const script = `#!${process.execPath}
const fs = require('node:fs');
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  fs.writeFileSync(${JSON.stringify(capture)}, JSON.stringify({ args: process.argv.slice(2), env: process.env, cwd: process.cwd(), input, mode: fs.statSync(process.cwd()).mode & 0o777, entries: fs.readdirSync(process.cwd()) }));
  ${behavior || `process.stdout.write(${JSON.stringify(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, structured_output: decision }))});`}
});
`;
  fs.writeFileSync(path.join(bin, process.platform === 'win32' ? 'claude.cmd' : 'claude'), script, { mode: 0o700 });
  const env = { PATH: bin, CLAUDE_CODE_OAUTH_TOKEN: 'private-oauth-token', EXONOUS_REVIEW_BACKEND: 'claude', EXONOUS_REVIEW_MODEL: 'claude-sonnet-4-6', EXONOUS_SOURCE_01_URL: 'https://github.com/owner/repo', ANTHROPIC_API_KEY: 'private-api-key', NODE_OPTIONS: '--private-injection', GITHUB_TOKEN: 'private-github-token', EXONOUS_REVIEW_BASE_URL: 'https://private.gateway' };
  return { ...fixtureData, capture, env, options: { env, open: () => ({ dir: fixtureData.dir, latest: fixtureData.latest }), request: () => { throw new Error('API fallback forbidden'); } } };
}

test('Claude configuration fails before any source opens without API fallback', async () => {
  for (const env of [
    { EXONOUS_REVIEW_BACKEND: 'other', EXONOUS_REVIEW_API_KEY: 'key', EXONOUS_REVIEW_MODEL: 'review-model', EXONOUS_REVIEW_BASE_URL: 'https://gateway.invalid/v1' },
    { EXONOUS_REVIEW_BACKEND: '', EXONOUS_REVIEW_API_KEY: 'key', EXONOUS_REVIEW_MODEL: 'review-model', EXONOUS_REVIEW_BASE_URL: 'https://gateway.invalid/v1' },
    { EXONOUS_REVIEW_BACKEND: 'claude', EXONOUS_REVIEW_MODEL: 'claude-sonnet-4-6' },
    { EXONOUS_REVIEW_BACKEND: 'claude', CLAUDE_CODE_OAUTH_TOKEN: 'token' },
    { EXONOUS_REVIEW_BACKEND: 'claude', CLAUDE_CODE_OAUTH_TOKEN: 'token', EXONOUS_REVIEW_MODEL: 'bad model' },
    { EXONOUS_REVIEW_BACKEND: 'claude', CLAUDE_CODE_OAUTH_TOKEN: 'token\n', EXONOUS_REVIEW_MODEL: 'review-model' },
  ]) {
    let touched = false;
    await assert.rejects(reviewAndPlan([{ id: 'fixture' }], { env, open: () => { touched = true; }, request: () => { touched = true; } }), { message: 'reviewer configuration unavailable' });
    assert.equal(touched, false);
  }
});

test('Claude real transport sends context on stdin, isolates credentials and validates decisions', { skip: process.platform === 'win32' }, async (t) => {
  const { source, capture, options } = claudeFixture(t);
  const [report] = await reviewAndPlan([source], options);
  assert.equal(report.reviews[0].decision, 'defer');
  assert.equal(report.tasks.length, 0);
  const sent = JSON.parse(fs.readFileSync(capture, 'utf8'));
  assert.match(sent.input, /PRIVATE-BRAND/);
  assert.doesNotMatch(JSON.stringify(sent.args), /PRIVATE-BRAND|private-oauth-token|private-engine/);
  for (const flag of ['--print', '--safe-mode', '--strict-mcp-config', '--disable-slash-commands', '--no-session-persistence']) assert.ok(sent.args.includes(flag));
  for (const [flag, value] of [['--tools', ''], ['--setting-sources', ''], ['--mcp-config', '{"mcpServers":{}}'], ['--output-format', 'json'], ['--model', 'claude-sonnet-4-6']]) assert.equal(sent.args[sent.args.indexOf(flag) + 1], value);
  assert.equal(JSON.parse(sent.args[sent.args.indexOf('--json-schema') + 1]).additionalProperties, false);
  assert.match(sent.args[sent.args.indexOf('--system-prompt') + 1], /untrusted data/);
  assert.equal(sent.env.CLAUDE_CODE_OAUTH_TOKEN, 'private-oauth-token');
  assert.equal(sent.env.HOME, sent.cwd);
  assert.equal(sent.env.CLAUDE_CONFIG_DIR, sent.cwd);
  assert.equal(sent.mode, 0o700);
  assert.deepEqual(sent.entries, []);
  assert.doesNotMatch(JSON.stringify(sent.env), /private-api-key|private-github-token|private-injection|private\.gateway|EXONOUS_SOURCE/);
  assert.ok(!fs.existsSync(sent.cwd));
  assert.doesNotMatch(JSON.stringify(report), /PRIVATE-BRAND|private-oauth-token/);
});

test('Claude real transport rejects malformed, refusal, error, invalid decisions and bounded output safely', { skip: process.platform === 'win32' }, async (t) => {
  for (const behavior of [
    `process.stdout.write('PRIVATE-BRAND invalid JSON');`,
    `process.stdout.write(JSON.stringify({type:'result',subtype:'success',is_error:false,result:'PRIVATE-BRAND refusal'}));`,
    `process.stdout.write(JSON.stringify({type:'result',subtype:'error_during_execution',is_error:true,structured_output:{decisions:[]}}));`,
    `process.stdout.write(JSON.stringify({type:'result',subtype:'success',is_error:false,structured_output:{decisions:[],leak:'PRIVATE-BRAND'}}));`,
    `process.stdout.write(JSON.stringify({type:'result',subtype:'success',is_error:false,structured_output:{decisions:[{scope:'map-999',decision:'adopt'}]}}));`,
    `process.stderr.write('PRIVATE-BRAND private-token'); process.exitCode = 1;`,
    `process.stdout.write('PRIVATE-BRAND'.repeat(100000));`,
    `process.stderr.write('PRIVATE-BRAND'.repeat(100000));`,
  ]) {
    const { source, options, capture } = claudeFixture(t, behavior);
    await assert.rejects(reviewAndPlan([source], options), { message: 'fixture: reviewer failed' });
    const sent = JSON.parse(fs.readFileSync(capture, 'utf8'));
    assert.ok(!fs.existsSync(sent.cwd));
  }
});

test('Claude transport terminates at 180 seconds and removes its private directory', { skip: process.platform === 'win32' }, async (t) => {
  const { source, options } = claudeFixture(t, `setInterval(() => {}, 1000);`);
  const created = t.mock.method(fs, 'mkdtempSync');
  let expire;
  const timeout = t.mock.method(global, 'setTimeout', (callback, delay) => {
    assert.equal(delay, 180000);
    expire = callback;
  });
  const pending = reviewAndPlan([source], options);
  const rejected = assert.rejects(pending, { message: 'fixture: reviewer failed' });
  assert.equal(timeout.mock.callCount(), 1);
  expire();
  await rejected;
  assert.equal(created.mock.callCount(), 1);
  assert.equal(fs.existsSync(created.mock.calls[0].result), false);
});

test('Claude executable launch failure exposes no process details', async (t) => {
  const { source, options, env } = claudeFixture(t);
  await assert.rejects(reviewAndPlan([source], { ...options, env: { ...env, PATH: '/missing/PRIVATE-BRAND' } }), { message: 'fixture: reviewer failed' });
});

test('explicit Responses backend preserves the existing endpoint transport', async (t) => {
  const { source, dir, latest } = fixture(t);
  let called = false;
  const [report] = await reviewAndPlan([source], {
    env: { EXONOUS_REVIEW_BACKEND: 'responses', EXONOUS_REVIEW_API_KEY: 'key', EXONOUS_REVIEW_MODEL: 'review-model', EXONOUS_REVIEW_BASE_URL: 'https://gateway.invalid/v1', EXONOUS_SOURCE_01_URL: 'https://github.com/owner/repo' },
    open: () => ({ dir, latest }),
    request: async () => { called = true; return { ok: true, json: async () => ({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ decisions: [{ scope: 'map-001', decision: 'reject', reason: 'already-covered', localFit: 'no-local-benefit', evidence: 'documentation-change', risk: 'low', steps: [] }] }) }] }] }) }; }
  });
  assert.equal(called, true);
  assert.equal(report.reviews[0].decision, 'reject');
});
