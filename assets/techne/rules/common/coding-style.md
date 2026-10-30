# Coding style

Prefer immutable updates for shared state. KISS, DRY (real duplication only), YAGNI.

Organize by feature; ~200–400 lines typical, ~800 soft max for hand-written sources.

Validate at boundaries; schema tools when available; safe user messages, detailed server logs.

Naming: descriptive; booleans as predicates. Language folders override casing.

Avoid deep nesting, magic numbers, and oversized functions.

Done: small units, handled errors, no hardcoded secrets.
