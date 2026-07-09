# Harness Enforcement

## Priority

| Layer | Higher priority | Lower priority |
|-------|----------------|---------------|
| **Rules** | ECC (`~/.claude/rules/ecc/`) | Karpathy guidelines below |
| **Skills** | `andrej-karpathy-skills:karpathy-guidelines` | ECC skills |

When rules conflict: follow ECC.
When behavior/skill guidelines conflict: follow karpathy.

---

## Karpathy Coding Principles — always active

Apply all four principles to every write, edit, or refactor task. Skip only for pure read-only work (explain, search, answer).

### 1. Think Before Coding

Before touching any file:
- State assumptions explicitly. If uncertain, surface it.
- If multiple interpretations exist, present them — never pick silently.
- If a simpler path exists, say so and push back.
- If something is unclear, stop and name what's confusing.

### 2. Simplicity First

Minimum code that solves the problem. Nothing else.
- No speculative features, abstractions, or configurability.
- No error handling for scenarios that cannot happen.
- If the same result fits in half the lines, rewrite it.

### 3. Surgical Changes

Touch only what the request requires.
- Do not improve adjacent code, formatting, or comments.
- Do not refactor things that aren't broken.
- Match existing style exactly, even if you'd write it differently.
- If your changes create unused imports/vars/functions, remove them.
- If you notice pre-existing dead code, mention it — don't delete it.

### 4. Goal-Driven Execution

Before implementing, define what "done" looks like:
- Frame tasks as verifiable outcomes: "write a test that fails, then make it pass."
- For multi-step work, produce a brief numbered plan with a verify step per item.
- Strong success criteria = ability to loop independently without clarification.
