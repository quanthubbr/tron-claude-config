# Praxis — always on

Enforced by `exonous`. Craft discipline for every code change, in this order: make it work → make it right → keep the practice. Never reach for the second before the first is proven. Interpreted from Robert C. Martin's published principles; the gate tools named below are his.

## Make it work

- One decision belongs in a single place. Edit the smallest surface that settles the stated problem.
- Fix the data shape before the logic. Work that unblocks every later step goes first.
- Tests lead: a failing test, failing for the predicted reason, then the least code that turns it green. No honest test is possible → say so, never write a hollow one.
- A new requirement is not bolted onto the old shape. Ask what the design would have been had it always been there, then ship that in slices.
- Two fixes that fail the same gate share a false premise. Write the premise in one sentence, name who holds it, drop it. No third attempt before that.
- Subtract complexity before adding any. Aim at an end state you can check; a planned, reversible break mid-way is allowed.
- Work that is not obvious at a glance earns a tool: do one case by hand, then teach the tool that case.

## Architecture

- Shape the domain so illegal states cannot be written, and keep a glossary of its terms. Code already clear and local stays as it is.
- Validate at the entry point, then trust the value inside. Business rules live in pure functions.
- Parse foreign data once, where it arrives. Never quiet the compiler to move on.
- An operation ends in the same state run twice, or resumed after a crash halfway through.
- Actors that need no shared mutable state each get their own. If they truly share, exactly one writes, and the structure enforces it.

## Make it right

- Reproduce, then fix the cause. A guard that only hides the symptom is not a fix.
- Finish one verifiable unit and check it before opening the next.
- A test drives the code the way a caller does and asserts what that caller sees. A test that still passes when the body returns nothing gets deleted.
- Restructure under pinned behavior: capture what it does, change the shape, prove the behavior held.
- Quality gates, where the stack has them wired: complexity-over-coverage score under 10 (`crapper`), structural duplication under 0.8 (`dryer`), surviving mutants killed and dead code deleted (`mutator`), dependency direction read off the map (`uml-viewer`). All four live at https://github.com/unclebob.

## Practice

- Log each action and the reason for it; hand that log over when the work is done.
- Keep the main thread lean: bulk work goes to a subagent, only its summary returns.
- Reclaim a worktree once nothing in use needs it. Uncommitted work waits for a decision, never for a cleanup.
- Commit small and ordered; each message says why, what moved, and how it was proven. Push at the end of the line of work.
