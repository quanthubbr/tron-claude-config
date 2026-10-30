'use strict';

// Secret scrubber for captured session text: nothing reaches the vault without passing here. Node builtins only.
const PATTERNS = [
  [/-----BEGIN [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----[\s\S]*?(?:-----END [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----|$)/g, 'private_key'],
  [/\bbearer\s+[A-Za-z0-9._\-+/=]{16,}/gi, 'bearer_token'],
  [/\bsk-[A-Za-z0-9_-]{16,}/g, 'api_key'],
  [/\b(?:sk|rk)_live_[A-Za-z0-9_-]{16,}/g, 'stripe_key'],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/g, 'github_token'],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/g, 'github_token'],
  [/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, 'aws_key'],
  [/\bAIza[A-Za-z0-9_-]{30,}/g, 'google_api_key'],
  [/\b1\/\/[0-9A-Za-z_-]{20,}/g, 'google_oauth'],
  [/\bEAA[A-Za-z0-9]{20,}/g, 'meta_token'],
  [/\b\d{6,10}:AA[A-Za-z0-9_-]{30,}\b/g, 'telegram_token'],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/g, 'slack_token'],
  [/\bxapp-[A-Za-z0-9-]{10,}/g, 'slack_token'],
  [/\beyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/g, 'jwt'],
  [/\b[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^:/\s]+:[^@\s]+@[^\s]+/g, 'url_credentials'],
  [/\b[A-Za-z0-9_-]*(?:authorization|password|passwd|secret|token|api[_-]?key)["']?\s*[:=]\s*["']?[^\s"',;]{6,}/gi, 'credential'],
];
// Terminal escapes, NUL, bidi overrides and zero-width chars: not secrets, but they hide text or break markdown.
const STRIP = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/g;

function sanitize(text) {
  let out = String(text ?? '').replace(STRIP, '');
  for (const [pattern, label] of PATTERNS) out = out.replace(pattern, `(redacted:${label})`);
  return out;
}

/** Sanitized, single-line, at most max chars. */
function line(text, max = 160) {
  const flat = sanitize(text).replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

module.exports = { sanitize, line };
