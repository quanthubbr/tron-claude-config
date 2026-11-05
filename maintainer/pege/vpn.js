#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { resolveReviewEndpoint } = require('./lib/reviewer');

const OPTIONS = new Set('client dev dev-type proto remote remote-random remote-random-hostname resolv-retry nobind persist-key persist-tun mute-replay-warnings remote-cert-tls verify-x509-name ns-cert-type auth-nocache auth-retry auth cipher data-ciphers data-ciphers-fallback tls-version-min tls-version-max tls-cipher tls-ciphersuites key-direction reneg-sec verb mute connect-timeout connect-retry connect-retry-max server-poll-timeout explicit-exit-notify keepalive ping ping-restart ping-exit comp-lzo compress allow-compression tun-mtu mssfix fragment route route-ipv6 route-nopull redirect-gateway dhcp-option block-outside-dns fast-io sndbuf rcvbuf pull-filter'.split(' '));
const INLINE = new Set(['ca', 'cert', 'key', 'tls-auth', 'tls-crypt', 'tls-crypt-v2', 'extra-certs']);
for (const option of ['disable-dco', 'hand-window', 'push-peer-info', 'remap-usr1']) OPTIONS.add(option);

function validateProfile(profile) {
  try {
    if (typeof profile !== 'string' || !profile.trim() || profile.length > 200000 || profile.includes('\0')) throw new Error();
    let inline = null;
    let needsAuth = false;
    for (const raw of profile.split(/\r?\n/)) {
      const line = raw.trim();
      if (inline) {
        if (line === `</${inline}>`) inline = null;
        continue;
      }
      if (!line || /^[#;]/.test(line)) continue;
      const tag = /^<([a-z-]+)>$/.exec(line);
      if (tag && INLINE.has(tag[1])) { inline = tag[1]; continue; }
      const [name, ...args] = line.split(/\s+/);
      if (name === 'auth-user-pass' && !args.length) { needsAuth = true; continue; }
      if (name === 'setenv' && /^(?:UV_[A-Z0-9_]+|CLIENT_CERT)$/.test(args[0] || '')) continue;
      if (name === 'setenv' && args[0] === 'opt' && OPTIONS.has(args[1])) continue;
      if (name === 'ignore-unknown-option' && args.length && args.every((option) => OPTIONS.has(option))) continue;
      if (!OPTIONS.has(name)) throw new Error();
      if (name === 'remap-usr1' && (args.length !== 1 || !['SIGTERM', 'SIGHUP'].includes(args[0]))) throw new Error();
    }
    if (inline) throw new Error();
    return needsAuth;
  } catch {
    throw new Error('VPN configuration unavailable');
  }
}

function runSudo(args) {
  execFileSync('sudo', args, { stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000, env: { PATH: '/usr/sbin:/usr/bin:/sbin:/bin' } });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function probeGateway(base, request = fetch) {
  try {
    const endpoint = resolveReviewEndpoint({ EXONOUS_REVIEW_BASE_URL: base }).replace(/\/responses$/, '/models');
    const response = await request(endpoint, { redirect: 'error', signal: AbortSignal.timeout(5000) });
    if (response.body) await response.body.cancel();
    return response.ok || response.status === 401;
  } catch {
    return false;
  }
}

async function startVpn({ env = process.env, run = runSudo, probe = probeGateway, delay = sleep } = {}) {
  try {
    const needsAuth = validateProfile(env.EXONOUS_REVIEW_VPN_PROFILE);
    resolveReviewEndpoint(env);
    const auth = env.EXONOUS_REVIEW_VPN_AUTH;
    if (needsAuth && !auth) throw new Error();
    if (auth && !/^[^\r\n]+\n[^\r\n]+\n?$/.test(auth)) throw new Error();
    if (!path.isAbsolute(env.RUNNER_TEMP || '')) throw new Error();
    const directory = fs.mkdtempSync(path.join(env.RUNNER_TEMP, 'source-review-vpn-'));
    fs.chmodSync(directory, 0o700);
    fs.writeFileSync(path.join(env.RUNNER_TEMP, 'source-review-vpn-state'), directory, { mode: 0o600, flag: 'wx' });
    const profile = path.join(directory, 'client.ovpn');
    fs.writeFileSync(profile, env.EXONOUS_REVIEW_VPN_PROFILE, { mode: 0o600 });
    fs.writeFileSync(path.join(directory, 'vpn.log'), '', { mode: 0o600 });
    fs.writeFileSync(path.join(directory, 'pid'), '', { mode: 0o600 });
    const args = ['-n', 'openvpn', '--config', profile, '--script-security', '1', '--user', 'nobody', '--group', 'nogroup', '--persist-key', '--persist-tun', '--verb', '1', '--daemon', '--writepid', path.join(directory, 'pid'), '--log', path.join(directory, 'vpn.log')];
    if (auth) {
      const authPath = path.join(directory, 'auth');
      fs.writeFileSync(authPath, auth, { mode: 0o600 });
      args.push('--auth-user-pass', authPath, '--auth-nocache');
    }
    run(args);
    for (let attempt = 0; attempt < 12; attempt++) {
      const initialized = fs.readFileSync(path.join(directory, 'vpn.log'), 'utf8').includes('Initialization Sequence Completed');
      if (initialized && await probe(env.EXONOUS_REVIEW_BASE_URL)) return;
      await delay(2000);
    }
    throw new Error();
  } catch {
    throw new Error('VPN connection unavailable');
  }
}

async function stopVpn({ env = process.env, run = runSudo, processArgs = (pid) => fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0'), delay = sleep } = {}) {
  try {
    const state = path.join(env.RUNNER_TEMP, 'source-review-vpn-state');
    if (!fs.existsSync(state)) return;
    const directory = fs.readFileSync(state, 'utf8');
    if (path.dirname(directory) !== env.RUNNER_TEMP || !path.basename(directory).startsWith('source-review-vpn-')) throw new Error();
    const pid = fs.readFileSync(path.join(directory, 'pid'), 'utf8').trim();
    const owns = () => {
      try {
        const args = processArgs(pid);
        return /^\d+$/.test(pid) && args.includes(path.join(directory, 'client.ovpn')) && args.includes(path.join(directory, 'pid')) && args.some((arg) => /(?:^|\/)openvpn$/.test(arg));
      } catch { return false; }
    };
    if (owns()) {
      run(['-n', 'kill', '-TERM', pid]);
      for (let attempt = 0; attempt < 10 && owns(); attempt++) await delay(500);
      if (owns()) run(['-n', 'kill', '-KILL', pid]);
    }
    fs.rmSync(directory, { recursive: true, force: true });
    fs.rmSync(state, { force: true });
    fs.rmSync(path.join(env.RUNNER_TEMP, 'source-review-vpn-install.log'), { force: true });
  } catch {
    throw new Error('VPN cleanup failed');
  }
}

if (require.main === module) {
  const action = process.argv[2] === 'start' ? startVpn : process.argv[2] === 'stop' ? stopVpn : null;
  Promise.resolve().then(() => { if (!action) throw new Error(); return action(); }).catch(() => {
    process.stderr.write('Source review VPN operation failed\n');
    process.exitCode = 1;
  });
}

module.exports = { validateProfile, startVpn, stopVpn, probeGateway };
