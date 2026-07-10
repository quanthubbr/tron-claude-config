---
description: Security review of staged or branch changes — secrets, injection, auth, XSS, and sensitive data exposure
argument-hint: [blank for staged/branch diff | --staged | --branch]
model: sonnet
---

# Security Review

Required by `@tron/claude-config` `/commit-changes`. Review the current diff for security issues before committing. Block the commit path if CRITICAL or HIGH findings remain unfixed.

**Input**: $ARGUMENTS

---

## Phase 1 — GATHER

```bash
git status --short
git diff --staged
git diff HEAD
```

Scope:
- Default / `--staged`: prefer staged diff; fall back to unstaged vs `HEAD` if nothing staged
- `--branch`: review `$(git merge-base HEAD main 2>/dev/null || git merge-base HEAD master)..HEAD` plus working tree

If no changes, stop: "Nothing to review."

Read each changed file with enough context to judge trust boundaries (auth, input, file I/O, network, crypto).

---

## Phase 2 — CHECKLIST

### 1. Secrets management (CRITICAL)
- [ ] No hardcoded API keys, tokens, passwords, private keys
- [ ] No real `.env` / credential files staged
- [ ] Secrets only via env / secret manager; missing-secret fails closed

### 2. Injection (CRITICAL)
- [ ] No string-concatenated SQL/shell
- [ ] Parameterized queries / safe APIs
- [ ] User input never passed unsanitized to `exec`, `eval`, or template engines that execute code

### 3. XSS & HTML (CRITICAL / HIGH)
- [ ] User HTML sanitized or avoided
- [ ] No unsafe `dangerouslySetInnerHTML` / `v-html` without sanitization
- [ ] URLs validated before use in redirects or links

### 4. Auth & authorization (CRITICAL / HIGH)
- [ ] Sensitive operations check identity and role
- [ ] No trust of client-supplied role/id alone
- [ ] Tokens not stored in insecure places when applicable

### 5. Path & file access (HIGH)
- [ ] No path traversal from user input
- [ ] Uploads constrained (type, size, extension) when present

### 6. Sensitive data exposure (HIGH)
- [ ] No secrets/PII in logs, errors, or client responses
- [ ] Error messages generic to callers; details only server-side

### 7. Dependencies & supply chain (MEDIUM / HIGH)
- [ ] No new dependency from untrusted/unknown source without justification
- [ ] Install scripts / `curl | bash` called out if introduced

### 8. CSRF / session (when applicable)
- [ ] State-changing endpoints protected
- [ ] Cookie flags sensible (`HttpOnly`, `Secure`, `SameSite`) when touching sessions

Skip checklist items that clearly do not apply to the diff; say so briefly.

---

## Phase 3 — REPORT

Print a compact table, severity highest first:

| Severity | Location (file:line) | Finding |
|----------|----------------------|---------|

**Decision:**
- Any CRITICAL or HIGH → **BLOCK** — must fix before `/commit-changes` creates the bypass token
- Only MEDIUM/LOW → **PASS** with notes
- No findings → **PASS** — say "Security review found no issues"

Also state:
- Files reviewed (count + names)
- Whether gitleaks / other scanners were run (if available, run them and include results)

```bash
# If gitleaks is installed:
gitleaks git --staged 2>/dev/null || gitleaks detect --no-git --source . 2>/dev/null || true
```

---

## Notes

- This command is the harness security gate for commits. Do not skip it during `/commit-changes`.
- Prefer fixing CRITICAL/HIGH in-session; do not commit with known unresolved HIGH/CRITICAL security findings.
- Broader ECC security patterns (payments, blockchain, CSP hardening) apply when the diff touches those domains — expand the checklist accordingly.
