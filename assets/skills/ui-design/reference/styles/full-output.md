# Full output enforcement

Use when a task requires complete deliverables—full files, every component, every section—with no truncation or placeholder gaps.

## Baseline

Treat output as production-bound. Partial work is broken work. If the user asked for five components, ship five finished components. Do not shorten to save tokens.

## Hard failures (never emit)

**Code blocks:** ellipsis comments, stub markers, deferred implementation notes, duplicated “copy the pattern above” notes, or literal `...` where statements belong

**Narrative:** prompts to request continuation, claims that detail was withheld to save space, hand-wavy references to “the same approach elsewhere”, or instructing the reader to finish the work

**Shape:** Outline-level artifacts when implementation was requested; showing only bookends while omitting the middle; a single specimen plus verbal recipe for repeated structures; narrating behavior instead of supplying source

## Process

1. **Scope** — Count deliverables (files, functions, answers). Lock the count.  
2. **Build** — Produce each item completely.  
3. **Cross-check** — Re-read the request; add anything missing before sending.

## Long responses

When nearing the token ceiling:

- Do not compress remaining parts into summaries  
- Do not jump to a premature conclusion  
- Stop at a clean boundary (end of function, file, or section)  
- End with:

```
[PAUSED — X of Y complete. Send "continue" to resume from: next section name]
```

On “continue”, resume exactly there—no recap, no duplicate content.

## Final verify

- No omission shortcuts from the hard-failure list  
- Every requested item present and runnable where code was asked  
- No space-saving shortcuts
