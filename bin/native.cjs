#!/usr/bin/env node
'use strict';
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const targets = {
  'darwin:arm64': 'aarch64-apple-darwin',
  'darwin:x64': 'x86_64-apple-darwin',
  'linux:arm64': 'aarch64-unknown-linux-gnu',
  'linux:x64': 'x86_64-unknown-linux-gnu',
  'win32:x64': 'x86_64-pc-windows-msvc',
};
const target = targets[`${process.platform}:${process.arch}`];
if (!target) {
  console.error('exonous: no native executable for this platform');
  process.exit(1);
}
const root = path.resolve(__dirname, '..');
const binary = path.join(root, 'native', target, process.platform === 'win32' ? 'exonous.exe' : 'exonous');
const env = { ...process.env, EXONOUS_ASSETS: path.join(root, 'assets'), EXONOUS_NO_FORWARD: '1' };
delete env.EXONOUS_VERIFIED_RELEASE;
const probe = spawnSync(binary, ['--version'], { encoding: 'utf8', env });
if (probe.status !== 0 || probe.stdout.trim() !== require(path.join(root, 'package.json')).version) {
  console.error('exonous: native executable does not match npm package version');
  process.exit(1);
}
const args = process.argv.slice(2);
const result = spawnSync(binary, args.length ? args : ['install'], { stdio: 'inherit', env });
if (result.error) console.error(`exonous: ${result.error.message}`);
if (result.signal) process.kill(process.pid, result.signal);
process.exit(result.status === null ? 1 : result.status);
