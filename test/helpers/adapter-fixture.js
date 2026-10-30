'use strict';

// Fixture home per test: EXONOUS_HOME and HOME both point at temp dirs, PATH holds only node, updates off.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { beforeEach, afterEach } = require('node:test');

const KEYS = ['EXONOUS_HOME', 'HOME', 'PATH', 'EXONOUS_NO_UPDATE'];

// node's own bin dir may hold globally installed tool CLIs (gemini, opencode): only a node link plus system dirs.
function isolatedPath() {
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'adapter-bin-'));
  fs.symlinkSync(process.execPath, path.join(bin, 'node'));
  return [bin, '/usr/bin', '/bin'].join(path.delimiter);
}

function useFixtureHome() {
  let saved;
  const state = { osHome: null };
  beforeEach(() => {
    saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
    process.env.EXONOUS_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'adapter-home-'));
    state.osHome = fs.mkdtempSync(path.join(os.tmpdir(), 'adapter-oshome-'));
    process.env.HOME = state.osHome;
    process.env.PATH = isolatedPath();
    process.env.EXONOUS_NO_UPDATE = '1';
  });
  afterEach(() => {
    // Fixture homes hold a full design-stack copy each; leaking them fills the disk across runs.
    for (const dir of [process.env.EXONOUS_HOME, state.osHome, process.env.PATH.split(path.delimiter)[0]]) {
      if (dir && dir.startsWith(os.tmpdir())) fs.rmSync(dir, { recursive: true, force: true });
    }
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  return state;
}

const home = (...p) => path.join(process.env.EXONOUS_HOME, ...p);
const read = (...p) => fs.readFileSync(home(...p), 'utf8');
const readJson = (...p) => JSON.parse(read(...p));
function write(content, ...p) {
  fs.mkdirSync(path.dirname(home(...p)), { recursive: true });
  fs.writeFileSync(home(...p), typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`);
}
const exists = (...p) => fs.existsSync(home(...p));

function quiet() {
  const logs = [];
  return { logs, log: (m) => logs.push(m) };
}

const NODE = '/opt/node 20/bin/node';
const CLAUDE_MCP = {
  mcpServers: {
    atlas: { command: '/usr/local/bin/codebase-memory-mcp', args: ['--stdio'], env: { SECRET: 'x' } },
    biblos: { type: 'http', url: 'https://mcp.context7.com/mcp', headers: { CONTEXT7_API_KEY: 'sk-secret' } },
  },
};

module.exports = { useFixtureHome, isolatedPath, home, read, readJson, write, exists, quiet, NODE, CLAUDE_MCP };
