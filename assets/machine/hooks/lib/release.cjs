'use strict';

// Self-contained: copied to ~/.claude/exonous/hooks/lib/, node builtins only.
const { execFileSync } = require('child_process');
const { testMode } = require('./paths.cjs');

const RELEASE_REF = /^v(\d+)\.(\d+)\.(\d+)$/;

function compareVersions(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

const releaseSource = (url) => (testMode() && process.env.EXONOUS_RELEASE_SOURCE) || url;

/**
 * Every vX.Y.Z tag on the source, oldest first; sha is the commit (annotated tags are peeled).
 * @param {string} url
 * @returns {{ version: string, parts: number[], sha: string }[]}
 */
function listReleases(url) {
  const source = releaseSource(url);
  const out = execFileSync('git', ['ls-remote', '--tags', '--', source, 'v*'], {
    encoding: 'utf8',
    timeout: 30000,
    stdio: ['ignore', 'pipe', 'ignore'],
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  const tags = new Map();
  for (const line of out.split('\n')) {
    const [sha, ref = ''] = line.split('\t');
    const name = ref.replace(/^refs\/tags\//, '');
    const peeled = name.endsWith('^{}');
    const tag = peeled ? name.slice(0, -3) : name;
    if (!RELEASE_REF.test(tag) || !sha) continue;
    // ^{} is the commit an annotated tag points to; a lightweight tag has none and is the commit itself.
    if (peeled || !tags.has(tag)) tags.set(tag, sha);
  }
  return [...tags]
    .map(([tag, sha]) => {
      const m = RELEASE_REF.exec(tag);
      return { sha, parts: [Number(m[1]), Number(m[2]), Number(m[3])] };
    })
    .sort((a, b) => compareVersions(a.parts, b.parts))
    .map((r) => ({ version: r.parts.join('.'), parts: r.parts, sha: r.sha }));
}

/**
 * @param {string} url
 * @param {{ major?: number }} [options]
 * @returns {{ version: string, sha: string } | null}
 */
function latestRelease(url, { major } = {}) {
  const top = listReleases(url).filter((r) => major === undefined || r.parts[0] === major).pop();
  return top ? { version: top.version, sha: top.sha } : null;
}

module.exports = { RELEASE_REF, compareVersions, releaseSource, listReleases, latestRelease };
