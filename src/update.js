'use strict';

// exonous update: moves this machine to the latest vX.Y.Z release of the same major (--major crosses it).
const selfupdate = require('../assets/machine/hooks/lib/selfupdate.cjs');

/**
 * @param {{ check?: boolean, background?: boolean, major?: boolean }} [options] check: report only, change nothing.
 * @returns {{ status: string, from?: string, to?: string, ref?: string, newMajor?: string, error?: string, reason?: string }}
 */
function update({ check = false, background = false, major = false } = {}) {
  return check ? selfupdate.check({ major }) : selfupdate.run({ background, major });
}

/** One line for the terminal, or null when there is nothing worth saying. */
function describe(result, { check = false } = {}) {
  const major = result.newMajor ? ` v${result.newMajor} is a new major — run \`exonous update --major\` to apply it.` : '';
  const messages = {
    'not-installed': 'exonous is not installed on this machine — run `exonous install`.',
    pinned: `pinned to "${result.ref}" — not updating (reinstall from a release tag to follow releases).`,
    'no-release': 'no vX.Y.Z release tag found on the source.',
    current: `up to date (v${result.from}).${major}`,
    available: `update available: v${result.from} → v${result.to}.${check ? ' Run `exonous update` to apply it.' : ''}${major}`,
    updated: `exonous updated v${result.from} → v${result.to} (restart your tools to load the new hooks).${result.warnings ? ' Install warned — see ~/.claude/exonous/state/update.log.' : ''}`,
    busy: 'another update is running.',
    isolated: `update to v${result.to} available, but EXONOUS_HOME points away from the real home — global installs are skipped.`,
    disabled: `automatic updates are off (${result.reason}).`,
    failed: `update to v${result.to} failed: ${result.error}`,
    error: `update check failed: ${result.error}`,
  };
  return messages[result.status] || null;
}

module.exports = { update, describe };
