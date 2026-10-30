# Extract flow

Find reusable patterns, tokens, and components; consolidate into the design system.

## Step 1: Locate the system

Find the component library or shared UI directory. Learn structure, naming, token layout, import conventions.

**No design system yet:** STOP—AskUserQuestion for preferred location/structure before creating one.

## Step 2: Spot candidates

In the target area:

- Components repeated 3+ times with same intent
- Hard-coded color, space, type, shadow → tokenize
- Inconsistent duplicates of one concept
- Repeated layout/interaction patterns
- Repeated type stacks or motion recipes

Extract only **3+ uses, same intent**. Premature abstraction loses.

## Step 3: Plan

- Components to extract; tokens to create; variants needed
- Names aligned with existing conventions
- Migration: how existing call sites switch over

Grow incrementally—clear wins now, not hypothetical futures.

## Step 4: Extract

- **Components:** clear props, variants, a11y (ARIA, keyboard, focus), brief usage notes
- **Tokens:** primitive vs semantic naming, documented when-to-use
- **Patterns:** when to apply, examples, variations

## Step 5: Migrate

Search instances; replace systematically; verify parity; delete dead implementations.

## Step 6: Document

Update library docs, token tables, Storybook/catalog if present.

## Never

- Extract one-offs without generalization
- Over-generic components
- Ignore existing conventions
- Skip types/prop docs
- Tokenize every literal
- Merge controls that differ in intent
